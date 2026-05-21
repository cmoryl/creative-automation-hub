// InDesign engine adapter — multi-page rendering.
//
// For each page declared on the template (or every page in the document when
// none are declared) the script exports a JPEG thumbnail and a single-page
// PDF.  It also exports a single multi-page master PDF spanning every page.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEMPLATES_DIR =
  process.env.LOVABLE_AGENT_TEMPLATES ||
  path.resolve(__dirname, "../../templates");

function resolveTemplatePath(sourceRef) {
  const m = String(sourceRef || "").match(/^bridge:\/\/templates\/(.+)$/);
  if (!m) throw new Error(`unsupported source_ref: ${sourceRef}`);
  return path.join(TEMPLATES_DIR, m[1]);
}

function esc(v) {
  return String(v ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n");
}

function buildJsx({ templatePath, variables, outDir, pages }) {
  const swapLines = Object.entries(variables || {})
    .filter(([, v]) => typeof v === "string" && !v.startsWith("#"))
    .map(([name, value]) => `swaps["${esc(name)}"] = "${esc(value)}";`)
    .join("\n  ");

  const declaredPages = Array.isArray(pages) && pages.length
    ? pages.map((p, i) => ({
        index: Number.isInteger(p.page_index) ? p.page_index : i + 1,
        name: p.name || `page_${i + 1}`,
      }))
    : null;

  return `
var swaps = {};
${swapLines}

// Normalise keys so "Lead Headline", "lead_headline", "LEAD-HEADLINE" and
// "{{lead_headline}}" all resolve to the same variable. Falls back to the
// frame's current contents when the placeholder copy IS the token.
function normKey(s) {
  if (s == null) return "";
  var t = String(s).replace(/^\\s*\\{\\{\\s*|\\s*\\}\\}\\s*$/g, "");
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

var normSwaps = {};
for (var sk in swaps) {
  if (swaps.hasOwnProperty(sk)) normSwaps[normKey(sk)] = swaps[sk];
}

function lookupSwap(label, name, contents) {
  var v = normSwaps[normKey(label)];
  if (v !== undefined) return v;
  v = normSwaps[normKey(name)];
  if (v !== undefined) return v;
  if (contents != null) {
    v = normSwaps[normKey(contents)];
    if (v !== undefined) return v;
  }
  return undefined;
}

var doc = app.open(File("${esc(templatePath)}"));

// --- Variable substitution ---------------------------------------------------
for (var i = 0; i < doc.textFrames.length; i++) {
  var tf = doc.textFrames[i];
  var contents = (tf.contents || "").replace(/^\\s+|\\s+$/g, "");
  var v = lookupSwap(tf.label, tf.name, contents);
  if (v !== undefined) {
    tf.contents = v;
  }
}

// --- Helpers ----------------------------------------------------------------
var pad = function (n) { return (n < 10 ? "0" : "") + n; };
var slug = function (s) { return String(s).replace(/[^a-zA-Z0-9_-]+/g, "_").toLowerCase(); };

var declared = ${JSON.stringify(declaredPages)};
var totalPages = doc.pages.length;
var pageList = [];
if (declared) {
  for (var d = 0; d < declared.length; d++) {
    if (declared[d].index <= totalPages) {
      pageList.push({ index: declared[d].index, name: declared[d].name });
    }
  }
} else {
  for (var n = 1; n <= totalPages; n++) {
    pageList.push({ index: n, name: "page_" + pad(n) });
  }
}

// --- Per-page JPEG thumbnail + per-page PDF ---------------------------------
app.jpegExportPreferences.exportResolution = 144;
app.jpegExportPreferences.jpegQuality = JPEGOptionsQuality.MAXIMUM;
app.jpegExportPreferences.jpegExportRange = ExportRangeOrAllPages.EXPORT_RANGE;

var pdfPreset = app.pdfExportPresets.itemByName("[High Quality Print]");

for (var p = 0; p < pageList.length; p++) {
  var info = pageList[p];
  var fname = "page_" + pad(p + 1) + "_" + slug(info.name);

  // JPEG
  app.jpegExportPreferences.pageString = String(info.index);
  var jpgFile = File("${esc(outDir)}/" + fname + ".jpg");
  doc.exportFile(ExportFormat.JPG, jpgFile, false);

  // PDF
  app.pdfExportPreferences.pageRange = String(info.index);
  var pdfPageFile = File("${esc(outDir)}/" + fname + ".pdf");
  doc.exportFile(ExportFormat.PDF_TYPE, pdfPageFile, false, pdfPreset);
}

// --- Combined multi-page master PDF -----------------------------------------
app.pdfExportPreferences.pageRange = PageRange.ALL_PAGES;
var masterPdf = File("${esc(path.join(outDir, "master.pdf"))}");
doc.exportFile(ExportFormat.PDF_TYPE, masterPdf, false, pdfPreset);

// --- Save the edited .indd next to outputs (read-only kept on disk) ---------
try {
  var inddCopy = File("${esc(path.join(outDir, "editable.indd"))}");
  doc.save(inddCopy);
} catch (e) { $.writeln("save copy failed: " + e); }

// --- Package: collect Links + Fonts + report --------------------------------
try {
  var pkgFolder = Folder("${esc(outDir)}/package");
  pkgFolder.create();
  doc.packageForPrint(pkgFolder, true, true, true, true, true, "", false, true);
} catch (e) { $.writeln("packageForPrint failed: " + e); }

doc.close(SaveOptions.NO);
`;
}

// Try multiple InDesign app names so the bridge works across CC / 2023-2025.
// Override with LOVABLE_INDESIGN_APP="Adobe InDesign 2025" (comma-separated).
const INDESIGN_APP_NAMES = (process.env.LOVABLE_INDESIGN_APP || [
  "Adobe InDesign 2025",
  "Adobe InDesign 2024",
  "Adobe InDesign 2023",
  "Adobe InDesign",
].join(",")).split(",").map((s) => s.trim()).filter(Boolean);

function spawnCapture(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stderr = "", stdout = "";
    child.stdout?.on("data", (d) => { const s = d.toString(); stdout += s; process.stdout.write(s); });
    child.stderr?.on("data", (d) => { const s = d.toString(); stderr += s; process.stderr.write(s); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      const tail = (stderr || stdout).trim().split("\n").slice(-6).join(" | ");
      reject(new Error(`exit ${code}${tail ? `: ${tail}` : ""}`));
    });
  });
}

async function runScript(jsxPath) {
  if (process.platform === "darwin") {
    let lastErr;
    for (const appName of INDESIGN_APP_NAMES) {
      try {
        await spawnCapture("osascript", [
          "-e",
          `tell application "${appName}" to do script file "${jsxPath}" language javascript`,
        ]);
        return;
      } catch (e) { lastErr = e; }
    }
    throw new Error(
      `InDesign launch failed (tried ${INDESIGN_APP_NAMES.join(", ")}). ` +
      `Set LOVABLE_INDESIGN_APP to the exact app name. Last error: ${lastErr?.message || "unknown"}`,
    );
  }
  if (process.platform === "win32") {
    const ps = `$id = New-Object -ComObject InDesign.Application; $id.DoScript("${jsxPath.replace(/\\/g, "\\\\")}", 1246973031)`;
    await spawnCapture("powershell", ["-NoProfile", "-Command", ps]);
    return;
  }
  throw new Error(`unsupported OS for InDesign: ${process.platform}`);
}


function zipFolder(srcDir, zipPath) {
  return new Promise((resolve, reject) => {
    let cmd, args, opts = { stdio: "inherit" };
    if (process.platform === "win32") {
      cmd = "powershell";
      args = ["-NoProfile", "-Command",
        `Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${zipPath}' -Force`];
    } else {
      cmd = "zip";
      args = ["-r", "-q", zipPath, "."];
      opts.cwd = srcDir;
    }
    const child = spawn(cmd, args, opts);
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`zip exited ${code}`)));
  });
}

async function uploadOutput({ apiBase, token, jobId, filePath, kind, metadata }) {
  const safe = path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, "_");
  const sigRes = await fetch(`${apiBase}/api/public/agent/upload-url`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ jobId, filename: safe }),
  });
  if (!sigRes.ok) throw new Error(`upload-url ${sigRes.status}`);
  const sig = await sigRes.json();
  const body = await fs.readFile(filePath);
  const put = await fetch(sig.signed_url, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body,
  });
  if (!put.ok) throw new Error(`upload PUT ${put.status}`);
  return { kind, url: sig.public_url, metadata };
}

async function safeUpload(args) {
  try { return await uploadOutput(args); }
  catch (e) { console.warn(`upload failed for ${args.filePath}: ${e.message}`); return null; }
}

export async function run(job, ctx) {
  const { apiBase, token, progress } = ctx;
  await progress("opening", 10, "Opening template in InDesign");
  const templatePath = resolveTemplatePath(job.template?.source_ref);
  await fs.access(templatePath).catch(() => {
    throw new Error(`Template not found: ${templatePath}`);
  });

  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), `lovable-job-${job.id}-`));
  const jsxPath = path.join(outDir, "render.jsx");
  const pages = Array.isArray(job.template?.pages) ? job.template.pages : [];

  await fs.writeFile(jsxPath, buildJsx({
    templatePath, variables: job.variables, outDir, pages,
  }));

  await progress("rendering", 40, `Rendering ${pages.length || "all"} page(s) in InDesign`);
  await runScript(jsxPath);

  const all = await fs.readdir(outDir);
  const pageJpgs = all.filter((f) => /^page_\d+_.*\.jpg$/.test(f)).sort();
  const pagePdfs = all.filter((f) => /^page_\d+_.*\.pdf$/.test(f) && f !== "master.pdf").sort();

  // Write manifest.
  const pkgDir = path.join(outDir, "package");
  await fs.mkdir(pkgDir, { recursive: true });
  await fs.writeFile(
    path.join(pkgDir, "manifest.json"),
    JSON.stringify({
      job_id: job.id,
      template: job.template?.name ?? null,
      source_ref: job.template?.source_ref ?? null,
      engine: "indesign",
      rendered_at: new Date().toISOString(),
      page_count: pageJpgs.length,
      pages: pageJpgs.map((f, i) => ({
        index: i + 1,
        thumbnail: f,
        pdf: pagePdfs[i] ?? null,
        name: pages[i]?.name ?? null,
      })),
      variables: job.variables ?? {},
    }, null, 2),
  );

  await progress("packaging", 75, "Zipping editable assets + fonts");
  const zipPath = path.join(outDir, "package.zip");
  try { await zipFolder(pkgDir, zipPath); }
  catch (e) { console.warn(`package zip failed: ${e.message}`); }

  await progress("uploading", 85, `Uploading ${pageJpgs.length} page(s) + master PDF`);
  const outputs = [];

  for (let i = 0; i < pageJpgs.length; i++) {
    const up = await safeUpload({
      apiBase, token, jobId: job.id,
      filePath: path.join(outDir, pageJpgs[i]),
      kind: "png",
      metadata: {
        source: "indesign",
        page_index: i + 1,
        page_name: pages[i]?.name ?? null,
        total_pages: pageJpgs.length,
      },
    });
    if (up) outputs.push(up);
  }

  const master = await safeUpload({
    apiBase, token, jobId: job.id,
    filePath: path.join(outDir, "master.pdf"),
    kind: "pdf",
    metadata: { source: "indesign", page_count: pageJpgs.length, master: true },
  });
  if (master) outputs.push(master);

  if (await fs.stat(zipPath).then(() => true).catch(() => false)) {
    const pkg = await safeUpload({
      apiBase, token, jobId: job.id,
      filePath: zipPath,
      kind: "package",
      metadata: {
        source: "indesign",
        page_count: pageJpgs.length,
        contents: ["master.pdf", ...pageJpgs, ...pagePdfs, "Links/", "Fonts/", "manifest.json"],
      },
    });
    if (pkg) outputs.push(pkg);
  }

  await progress("done", 100, "Outputs uploaded");
  return outputs;
}
