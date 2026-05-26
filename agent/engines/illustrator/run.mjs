// Illustrator engine adapter — drives the desktop app via ExtendScript.
//
// v2 capabilities:
//   - Text + colour substitution (v1, unchanged)
//   - Smart image swap: URL values in variables are downloaded locally and
//     relinked into placed items by layer name, auto-fit to the original
//     frame bounds.
//   - Multi-artboard auto: when no `pages` are declared the renderer walks
//     every artboard in the document.
//   - Font preflight: required fonts are scanned before substitution; the
//     job fails fast with a missing-font list instead of silent fallback.
//   - CSV data-merge: when job.rows[] is present, every row produces its
//     own page set; outputs are combined into one master PDF + per-row PNGs.
//
// Dependency-free — only Node built-ins + fetch.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEMPLATES_DIR =
  process.env.LOVABLE_AGENT_TEMPLATES ||
  path.resolve(__dirname, "../../templates");

const FONTS_DIR =
  process.env.LOVABLE_AGENT_FONTS ||
  path.resolve(__dirname, "../../fonts");

function resolveTemplatePath(sourceRef) {
  if (!sourceRef) throw new Error("template has no source_ref");
  const m = String(sourceRef).match(/^bridge:\/\/templates\/(.+)$/);
  if (!m) throw new Error(`unsupported source_ref: ${sourceRef}`);
  return path.join(TEMPLATES_DIR, m[1]);
}

function escapeForJsx(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n");
}

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function isImageValue(value) {
  if (!value || typeof value !== "string") return false;
  if (/^https?:\/\//i.test(value) && /\.(png|jpe?g|webp|tiff?|gif|svg)(\?|$)/i.test(value)) return true;
  if (/^data:image\//i.test(value)) return true;
  return false;
}

async function downloadImage(url, dest) {
  if (url.startsWith("data:")) {
    const m = url.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!m) throw new Error("invalid data: URI");
    await fs.writeFile(dest, Buffer.from(m[2], "base64"));
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image download ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
}

// Walk variables, replace image-URL values with { kind: "image", path: localPath }.
// Returns the rewritten variables map plus a list of downloads attempted.
async function materializeImageVars(variables, workDir) {
  const out = {};
  const downloads = [];
  for (const [k, v] of Object.entries(variables || {})) {
    if (isImageValue(v)) {
      const ext = v.startsWith("data:")
        ? "png"
        : (v.split("?")[0].match(/\.(\w+)$/)?.[1] ?? "png");
      const safe = k.replace(/[^a-zA-Z0-9_-]+/g, "_");
      const dest = path.join(workDir, `img_${safe}.${ext}`);
      try {
        await downloadImage(v, dest);
        out[k] = { kind: "image", path: dest, source_url: v };
        downloads.push({ key: k, dest, ok: true });
      } catch (e) {
        downloads.push({ key: k, source_url: v, ok: false, error: e.message });
        out[k] = v; // fall back to original string
      }
    } else {
      out[k] = v;
    }
  }
  return { variables: out, downloads };
}

// ---------- ExtendScript builders ----------

// Preflight: open the doc, list every textFont actually referenced + every
// placed file path; write a JSON report; close without saving.
function buildPreflightJsx({ templatePath, reportPath }) {
  return `
var doc = app.open(new File("${escapeForJsx(templatePath)}"));
var fontsUsed = {};
var placedFiles = [];
var artboardCount = doc.artboards.length;

for (var i = 0; i < doc.textFrames.length; i++) {
  try {
    var tf = doc.textFrames[i];
    var chars = tf.textRange.characterAttributes;
    var f = chars.textFont;
    if (f && f.name) fontsUsed[f.name] = true;
  } catch (e) {}
}

for (var p = 0; p < doc.placedItems.length; p++) {
  try {
    var pi = doc.placedItems[p];
    var name = "";
    try { name = pi.name || ""; } catch (e) {}
    var fpath = "";
    try { fpath = pi.file ? pi.file.fsName : ""; } catch (e) {}
    placedFiles.push({ name: name, path: fpath, exists: fpath ? new File(fpath).exists : false });
  } catch (e) {}
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/\\\\/g, "\\\\\\\\")
    .replace(/"/g, '\\\\"');
}

var fontList = [];
for (var fn in fontsUsed) fontList.push('"' + esc(fn) + '"');

var placedList = [];
for (var pl = 0; pl < placedFiles.length; pl++) {
  var p2 = placedFiles[pl];
  placedList.push(
    '{"name":"' + esc(p2.name) + '","path":"' + esc(p2.path) + '","exists":' + (p2.exists ? "true" : "false") + '}'
  );
}

var rep = new File("${escapeForJsx(reportPath)}");
rep.encoding = "UTF-8";
rep.open("w");
rep.write(
  '{"fonts":[' + fontList.join(",") + ']' +
  ',"placed":[' + placedList.join(",") + ']' +
  ',"artboard_count":' + artboardCount + '}'
);
rep.close();

doc.close(SaveOptions.DONOTSAVECHANGES);
`;
}

function buildJsx({ templatePath, variables, outDir, pages, renderAllArtboards }) {
  // Build var assignments — three kinds: text, color (#rrggbb), image (resolved path).
  const assignments = Object.entries(variables || {})
    .map(([name, value]) => {
      if (value && typeof value === "object" && value.kind === "image" && value.path) {
        return `vars["${escapeForJsx(name)}"] = { kind: "image", path: "${escapeForJsx(value.path)}" };`;
      }
      const rgb = typeof value === "string" && value.startsWith("#") ? hexToRgb(value) : null;
      if (rgb) {
        return `vars["${escapeForJsx(name)}"] = { kind: "color", r: ${rgb.r}, g: ${rgb.g}, b: ${rgb.b} };`;
      }
      return `vars["${escapeForJsx(name)}"] = { kind: "text", value: "${escapeForJsx(value)}" };`;
    })
    .join("\n  ");

  const pageList = Array.isArray(pages) && pages.length > 0 ? pages : null;
  const artboardIndexes = pageList
    ? pageList.map((p, i) => Number.isInteger(p.artboard_index) ? p.artboard_index : i)
    : null;
  const pageNames = pageList ? pageList.map((p, i) => p.name || `page_${i + 1}`) : null;

  return `
// Auto-generated by Lovable bridge agent (v2)
var vars = {};
${assignments}

function normKey(s) {
  if (s == null) return "";
  var t = String(s).replace(/^\\s*\\{\\{\\s*|\\s*\\}\\}\\s*$/g, "");
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

var normVars = {};
for (var vk in vars) {
  if (vars.hasOwnProperty(vk)) normVars[normKey(vk)] = vars[vk];
}

function lookupVar(rawName, rawContents) {
  var byName = normVars[normKey(rawName)];
  if (byName) return byName;
  if (rawContents != null) {
    var byContent = normVars[normKey(rawContents)];
    if (byContent) return byContent;
  }
  return null;
}

var doc = app.open(new File("${escapeForJsx(templatePath)}"));

var matched = [];
var unmatchedFrames = [];
var imageSwaps = [];
var errors = [];

function jsonEscape(s) {
  return String(s == null ? "" : s)
    .replace(/\\\\/g, "\\\\\\\\")
    .replace(/"/g, '\\\\"')
    .replace(/\\r?\\n/g, "\\\\n")
    .replace(/\\t/g, "\\\\t");
}

// --- Text substitution ------------------------------------------------------
for (var i = 0; i < doc.textFrames.length; i++) {
  try {
    var tf = doc.textFrames[i];
    var contents = (tf.contents || "").replace(/^\\s+|\\s+$/g, "");
    var name = "";
    try { name = tf.name || ""; } catch (eName) { name = ""; }
    var v = lookupVar(name, contents);
    if (v && v.kind === "text") {
      tf.contents = v.value;
      matched.push({ kind: "text", name: name, key: normKey(name) || normKey(contents) });
    } else {
      unmatchedFrames.push({ name: name, contents: contents.substring(0, 60) });
    }
  } catch (eFrame) {
    errors.push("textFrame[" + i + "]: " + eFrame);
  }
}

// --- Colour substitution on path items --------------------------------------
for (var p = 0; p < doc.pathItems.length; p++) {
  try {
    var pi = doc.pathItems[p];
    var pname = "";
    try { pname = pi.name || ""; } catch (ePN) { pname = ""; }
    if (!pname) continue;
    var pv = lookupVar(pname, null);
    if (pv && pv.kind === "color" && pi.filled) {
      var c = new RGBColor();
      c.red = pv.r; c.green = pv.g; c.blue = pv.b;
      try {
        pi.fillColor = c;
        matched.push({ kind: "color", name: pname, key: normKey(pname) });
      } catch (eColor) {
        errors.push("path[" + p + "] " + pname + ": " + eColor);
      }
    }
  } catch (ePath) {
    errors.push("pathItem[" + p + "]: " + ePath);
  }
}

// --- Image swap on placed items (relink + auto-fit) -------------------------
// Strategy: find placedItem by layer name, remember its current bounding box,
// repoint .file to the new asset, then scale the result to match the original
// bounds while preserving aspect ratio (centered).
for (var pp = 0; pp < doc.placedItems.length; pp++) {
  try {
    var ph = doc.placedItems[pp];
    var phName = "";
    try { phName = ph.name || ""; } catch (eN) { phName = ""; }
    if (!phName) continue;
    var iv = lookupVar(phName, null);
    if (!iv || iv.kind !== "image") continue;

    var newFile = new File(iv.path);
    if (!newFile.exists) {
      errors.push("image[" + phName + "]: missing local file " + iv.path);
      continue;
    }

    // Remember target bounds [left, top, right, bottom] in document points.
    var tb = ph.geometricBounds;
    var targetLeft = tb[0], targetTop = tb[1], targetRight = tb[2], targetBottom = tb[3];
    var targetW = targetRight - targetLeft;
    var targetH = targetTop - targetBottom;

    ph.file = newFile;

    // After relink, geometric bounds reflect the new asset's natural size.
    var nb = ph.geometricBounds;
    var nW = nb[2] - nb[0];
    var nH = nb[1] - nb[3];
    if (nW > 0 && nH > 0 && targetW > 0 && targetH > 0) {
      var sx = (targetW / nW) * 100;
      var sy = (targetH / nH) * 100;
      // Fit (contain): use the smaller scale to avoid overflow.
      var s = Math.min(sx, sy);
      ph.resize(s, s, true, true, true, true, s, Transformation.CENTER);
      // Re-center inside the target box.
      var nb2 = ph.geometricBounds;
      var nW2 = nb2[2] - nb2[0];
      var nH2 = nb2[1] - nb2[3];
      var cx = targetLeft + targetW / 2;
      var cy = targetBottom + targetH / 2;
      var newLeft = cx - nW2 / 2;
      var newTop = cy + nH2 / 2;
      ph.position = [newLeft, newTop];
    }

    imageSwaps.push({ name: phName, path: iv.path, fit: "contain" });
    matched.push({ kind: "image", name: phName, key: normKey(phName) });
  } catch (ePlace) {
    errors.push("placedItem[" + pp + "]: " + ePlace);
  }
}

// --- Substitution report -----------------------------------------------------
function objToJson(o, keys) {
  var parts = [];
  for (var k = 0; k < keys.length; k++) {
    parts.push('"' + keys[k] + '":"' + jsonEscape(o[keys[k]]) + '"');
  }
  return "{" + parts.join(",") + "}";
}
function arrToJson(arr, keys) {
  var out = [];
  for (var i = 0; i < arr.length; i++) out.push(objToJson(arr[i], keys));
  return "[" + out.join(",") + "]";
}
var varKeyList = [];
for (var vk2 in normVars) varKeyList.push('"' + jsonEscape(vk2) + '"');
var errList = [];
for (var ei = 0; ei < errors.length; ei++) errList.push('"' + jsonEscape(errors[ei]) + '"');

try {
  var report = new File("${escapeForJsx(path.join(outDir, "substitution-report.json"))}");
  report.encoding = "UTF-8";
  report.open("w");
  report.write(
    '{"matched":' + arrToJson(matched, ["kind","name","key"]) +
    ',"unmatched":' + arrToJson(unmatchedFrames, ["name","contents"]) +
    ',"image_swaps":' + arrToJson(imageSwaps, ["name","path","fit"]) +
    ',"vars":[' + varKeyList.join(",") + ']' +
    ',"errors":[' + errList.join(",") + ']}'
  );
  report.close();
} catch (eReport) {
  $.writeln("substitution-report write failed: " + eReport);
}

// --- Per-artboard PNG export -------------------------------------------------
var pngOpts = new ExportOptionsPNG24();
pngOpts.antiAliasing = true;
pngOpts.transparency = false;
pngOpts.artBoardClipping = true;

var renderAll = ${renderAllArtboards ? "true" : "false"};
var indices, names;
if (renderAll) {
  indices = [];
  names = [];
  for (var ab = 0; ab < doc.artboards.length; ab++) {
    indices.push(ab);
    var abName = "";
    try { abName = doc.artboards[ab].name; } catch (eAB) { abName = "artboard_" + (ab + 1); }
    names.push(abName || "artboard_" + (ab + 1));
  }
} else {
  indices = ${JSON.stringify(artboardIndexes ?? [0])};
  names = ${JSON.stringify(pageNames ?? ["preview"])};
}

var pad = function (n) { return (n < 10 ? "0" : "") + n; };
var slug = function (s) { return String(s).replace(/[^a-zA-Z0-9_-]+/g, "_").toLowerCase(); };

for (var ai = 0; ai < indices.length; ai++) {
  var idx = indices[ai];
  if (idx < doc.artboards.length) {
    doc.artboards.setActiveArtboardIndex(idx);
  }
  var filename = (indices.length > 1)
    ? ('page_' + pad(ai + 1) + '_' + slug(names[ai]) + '.png')
    : 'preview.png';
  var pngFile = new File("${escapeForJsx(outDir)}/" + filename);
  doc.exportFile(pngFile, ExportType.PNG24, pngOpts);
}

if (indices.length > 1) {
  var firstName = 'page_01_' + slug(names[0]) + '.png';
  var src = new File("${escapeForJsx(outDir)}/" + firstName);
  var dst = new File("${escapeForJsx(outDir)}/preview.png");
  try { src.copy(dst); } catch (e) {}
}

// --- Multi-page PDF ----------------------------------------------------------
var pdfFile = new File("${escapeForJsx(path.join(outDir, "master.pdf"))}");
var pdfOpts = new PDFSaveOptions();
pdfOpts.pDFPreset = "[High Quality Print]";
try { pdfOpts.artboardRange = ""; } catch (e) {}
doc.saveAs(pdfFile, pdfOpts);

// --- Editable .ai copy -------------------------------------------------------
var aiFile = new File("${escapeForJsx(path.join(outDir, "editable.ai"))}");
var aiOpts = new IllustratorSaveOptions();
try { aiOpts.compatibility = Compatibility.ILLUSTRATOR17; } catch (e) {}
aiOpts.pdfCompatible = true;
doc.saveAs(aiFile, aiOpts);

// --- File > Package ----------------------------------------------------------
var pkgParent = new Folder("${escapeForJsx(outDir)}");
try {
  doc.packageDocument(pkgParent, "package", {
    copyLinks: true,
    copyFonts: true,
    copyProfiles: true,
    createReport: true,
    cleanStudentData: false,
    copyLinkedFiles: true,
    overwriteExisting: true
  });
} catch (e) {
  $.writeln("packageDocument failed: " + e);
}

doc.close(SaveOptions.DONOTSAVECHANGES);
`;
}

// ---------- spawn + classifier ----------

function classifyIllustratorFailure(stderr, stdout, exitCode, signal) {
  const blob = `${stderr}\n${stdout}`;
  if (/font.*(not found|missing|unavailable|substitut)/i.test(blob)) return { reason: "missing_font", transient: false };
  if (/(link|asset|placed file|file).*(not found|missing|cannot find)/i.test(blob)) return { reason: "missing_asset", transient: false };
  if (/(locked|in use|cannot.*open|access.*denied|permission denied)/i.test(blob)) return { reason: "app_busy", transient: true };
  if (/(no space|disk full|enospc)/i.test(blob)) return { reason: "disk_full", transient: false };
  if (/(timed?\s*out|etimedout|econnreset)/i.test(blob)) return { reason: "timeout", transient: true };
  if (/(applescript|osascript).*error|execution error/i.test(blob)) return { reason: "app_busy", transient: true };
  if (/syntaxerror|extendscript|line \d+/i.test(blob)) return { reason: "extendscript_bug", transient: false };
  if (signal) return { reason: "killed", transient: true };
  return { reason: "unknown", transient: false };
}

function runIllustratorScript(jsxPath) {
  return new Promise((resolve, reject) => {
    let cmd, args;
    if (process.platform === "darwin") {
      const apple = `tell application "Adobe Illustrator" to do javascript file "${jsxPath}"`;
      cmd = "osascript";
      args = ["-e", apple];
    } else if (process.platform === "win32") {
      const ps = `$ai = New-Object -ComObject Illustrator.Application; $ai.DoJavaScriptFile("${jsxPath.replace(/\\/g, "\\\\")}")`;
      cmd = "powershell";
      args = ["-NoProfile", "-Command", ps];
    } else {
      return reject(new Error(`unsupported OS for Illustrator: ${process.platform}`));
    }
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { const s = d.toString(); stdout += s; process.stdout.write(s); });
    child.stderr.on("data", (d) => { const s = d.toString(); stderr += s; process.stderr.write(s); });
    child.on("error", (e) => {
      const err = new Error(`Illustrator spawn failed: ${e.message}`);
      Object.assign(err, { reason: "spawn_failed", transient: false, stderr: e.message, stdout: "", exitCode: null, signal: null });
      reject(err);
    });
    child.on("exit", (code, signal) => {
      if (code === 0) return resolve({ stdout, stderr });
      const { reason, transient } = classifyIllustratorFailure(stderr, stdout, code, signal);
      const tail = (stderr || stdout || "no output").trim().split("\n").slice(-3).join(" | ");
      const err = new Error(`Illustrator exited ${code ?? signal}: ${tail}`);
      Object.assign(err, {
        reason, transient,
        exitCode: code, signal,
        stderr: stderr.slice(-4000),
        stdout: stdout.slice(-2000),
        jsxPath,
      });
      reject(err);
    });
  });
}

// ---------- font preflight ----------

// macOS: list installed font family names via system_profiler. Cached per
// agent process; cost is ~200ms first call.
let _installedFontsCache = null;
async function listInstalledFonts() {
  if (_installedFontsCache) return _installedFontsCache;
  if (process.platform !== "darwin") {
    _installedFontsCache = new Set();
    return _installedFontsCache;
  }
  const child = spawn("system_profiler", ["SPFontsDataType", "-json"], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => (out += d.toString()));
  await new Promise((res) => child.on("exit", res));
  const families = new Set();
  try {
    const data = JSON.parse(out);
    const arr = data?.SPFontsDataType ?? [];
    for (const f of arr) {
      if (f._name) families.add(String(f._name).toLowerCase());
      if (Array.isArray(f.typefaces)) {
        for (const tf of f.typefaces) {
          if (tf._name) families.add(String(tf._name).toLowerCase());
          if (tf.family) families.add(String(tf.family).toLowerCase());
        }
      }
    }
  } catch {}
  _installedFontsCache = families;
  return families;
}

async function installFontsFromBundle() {
  if (process.platform !== "darwin") return [];
  let entries;
  try { entries = await fs.readdir(FONTS_DIR); } catch { return []; }
  const userFontsDir = path.join(os.homedir(), "Library", "Fonts");
  await fs.mkdir(userFontsDir, { recursive: true });
  const installed = [];
  for (const name of entries) {
    if (!/\.(otf|ttf|ttc)$/i.test(name)) continue;
    const dest = path.join(userFontsDir, name);
    try {
      await fs.access(dest);
    } catch {
      await fs.copyFile(path.join(FONTS_DIR, name), dest);
      installed.push(name);
    }
  }
  if (installed.length) _installedFontsCache = null; // bust cache
  return installed;
}

async function runPreflight({ templatePath, outDir }) {
  const jsx = buildPreflightJsx({
    templatePath,
    reportPath: path.join(outDir, "preflight.json"),
  });
  const jsxPath = path.join(outDir, "preflight.jsx");
  await fs.writeFile(jsxPath, jsx);
  await runIllustratorScript(jsxPath);
  try {
    return JSON.parse(await fs.readFile(path.join(outDir, "preflight.json"), "utf8"));
  } catch {
    return null;
  }
}

// ---------- upload helpers ----------

async function uploadOutput({ apiBase, token, jobId, filePath, kind, metadata }) {
  const filename = path.basename(filePath);
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
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

function zipFolder(srcDir, zipPath) {
  return new Promise((resolve, reject) => {
    let cmd, args, opts = { stdio: "inherit" };
    if (process.platform === "win32") {
      cmd = "powershell";
      args = ["-NoProfile", "-Command", `Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${zipPath}' -Force`];
    } else {
      cmd = "zip";
      args = ["-r", "-q", zipPath, "."];
      opts.cwd = srcDir;
    }
    const child = spawn(cmd, args, opts);
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`zip exited ${code}`)));
  });
}

async function safeUpload(args) {
  try { return await uploadOutput(args); }
  catch (e) {
    console.warn(`upload failed for ${args.filePath}: ${e.message}`);
    return null;
  }
}

// ---------- single-row render ----------

async function renderOne({ templatePath, variables, pages, outDir, renderAllArtboards, rowLabel }) {
  const { variables: resolvedVars, downloads } = await materializeImageVars(variables, outDir);
  const jsxPath = path.join(outDir, `render${rowLabel ? `_${rowLabel}` : ""}.jsx`);
  await fs.writeFile(
    jsxPath,
    buildJsx({ templatePath, variables: resolvedVars, outDir, pages, renderAllArtboards }),
  );
  await runIllustratorScript(jsxPath);
  const all = await fs.readdir(outDir);
  const pagePngs = all.filter((f) => /^page_\d+_.*\.png$/.test(f)).sort();
  return { pagePngs, downloads };
}

// ---------- top-level run ----------

export async function run(job, ctx) {
  const { apiBase, token, progress } = ctx;
  await progress("opening", 5, "Resolving template");

  const templatePath = resolveTemplatePath(job.template?.source_ref);
  await fs.access(templatePath).catch(() => {
    throw new Error(`Template not found locally: ${templatePath}. Place the .ai file in ${TEMPLATES_DIR} or set LOVABLE_AGENT_TEMPLATES.`);
  });

  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), `lovable-job-${job.id}-`));
  const pages = Array.isArray(job.template?.pages) ? job.template.pages : [];
  const renderAllArtboards = pages.length === 0;

  // ---------- Font preflight ----------
  await progress("preflight", 12, "Scanning required fonts & links");
  let preflight = null;
  try { preflight = await runPreflight({ templatePath, outDir }); }
  catch (e) { console.warn(`preflight skipped: ${e.message}`); }

  if (preflight?.fonts?.length) {
    const installedBundle = await installFontsFromBundle();
    if (installedBundle.length) {
      console.log(`[illustrator] installed ${installedBundle.length} bundled font(s): ${installedBundle.join(", ")}`);
    }
    const installed = await listInstalledFonts();
    const missing = preflight.fonts.filter((f) => {
      const family = String(f).split("-")[0].toLowerCase();
      return !installed.has(String(f).toLowerCase()) && !installed.has(family);
    });
    if (missing.length) {
      const err = new Error(`Missing fonts: ${missing.join(", ")}. Install them on this machine or drop the .otf/.ttf into ${FONTS_DIR} and retry.`);
      Object.assign(err, {
        reason: "missing_font",
        transient: false,
        stderr: missing.join("\n"),
        stdout: "",
        exitCode: null,
        signal: null,
      });
      throw err;
    }
  }
  if (preflight?.placed?.length) {
    const broken = preflight.placed.filter((p) => p.path && !p.exists);
    if (broken.length) {
      console.warn(`[illustrator] ${broken.length} broken placed link(s): ${broken.map((b) => b.path).join(", ")}`);
    }
  }

  // ---------- CSV / data-merge loop ----------
  const rows = Array.isArray(job.rows) && job.rows.length > 0 ? job.rows : null;
  const outputs = [];
  const allPagePngs = [];

  if (rows) {
    await progress("rendering", 25, `Rendering ${rows.length} row(s)`);
    for (let r = 0; r < rows.length; r++) {
      const rowVars = { ...(job.variables ?? {}), ...rows[r] };
      const rowDir = path.join(outDir, `row_${String(r + 1).padStart(3, "0")}`);
      await fs.mkdir(rowDir, { recursive: true });
      const { pagePngs } = await renderOne({
        templatePath, variables: rowVars, pages, outDir: rowDir, renderAllArtboards,
        rowLabel: `r${r + 1}`,
      });
      for (const png of pagePngs) {
        const tagged = `row_${String(r + 1).padStart(3, "0")}_${png}`;
        await fs.copyFile(path.join(rowDir, png), path.join(outDir, tagged));
        allPagePngs.push(tagged);
      }
      // copy per-row pdf so master can be assembled (or upload individually)
      try {
        await fs.copyFile(path.join(rowDir, "master.pdf"), path.join(outDir, `row_${String(r + 1).padStart(3, "0")}.pdf`));
      } catch {}
      await progress("rendering", 25 + Math.round((50 * (r + 1)) / rows.length), `Rendered row ${r + 1}/${rows.length}`);
    }
  } else {
    await progress("rendering", 40, `Rendering ${renderAllArtboards ? "all artboards" : (pages.length || 1) + " page(s)"}`);
    const { pagePngs } = await renderOne({
      templatePath, variables: job.variables ?? {}, pages, outDir, renderAllArtboards,
    });
    allPagePngs.push(...pagePngs);
  }

  // ---------- Package + upload ----------
  const pkgDir = path.join(outDir, "package");
  await fs.mkdir(pkgDir, { recursive: true });
  for (const f of ["editable.ai", "master.pdf", "preview.png", "substitution-report.json"]) {
    try { await fs.copyFile(path.join(outDir, f), path.join(pkgDir, f)); } catch {}
  }
  for (const png of allPagePngs) {
    try { await fs.copyFile(path.join(outDir, png), path.join(pkgDir, png)); } catch {}
  }

  let report = null;
  try { report = JSON.parse(await fs.readFile(path.join(outDir, "substitution-report.json"), "utf8")); }
  catch {}

  const sentKeys = Object.keys(job.variables ?? {});
  const matchedKeys = Array.from(new Set((report?.matched ?? []).map((m) => m.key).filter(Boolean)));
  const unmappedVars = sentKeys.filter((k) =>
    !matchedKeys.includes(k.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")),
  );

  await fs.writeFile(
    path.join(pkgDir, "manifest.json"),
    JSON.stringify({
      job_id: job.id,
      template: job.template?.name ?? null,
      source_ref: job.template?.source_ref ?? null,
      engine: "illustrator",
      engine_version: "v2",
      rendered_at: new Date().toISOString(),
      mode: rows ? "data_merge" : (renderAllArtboards ? "all_artboards" : "declared_pages"),
      row_count: rows ? rows.length : null,
      page_count: allPagePngs.length || 1,
      preflight: preflight ?? null,
      substitution: report
        ? {
            matched: report.matched ?? [],
            unmatched_frames: report.unmatched ?? [],
            image_swaps: report.image_swaps ?? [],
            unmapped_vars: unmappedVars,
          }
        : { error: "no substitution report" },
      variables: job.variables ?? {},
    }, null, 2),
  );

  await progress("packaging", 78, "Zipping editable assets + fonts");
  const zipPath = path.join(outDir, "package.zip");
  try { await zipFolder(pkgDir, zipPath); }
  catch (e) { console.warn(`package zip failed: ${e.message}`); }

  await progress("uploading", 85, `Uploading ${allPagePngs.length || 1} page(s) + artefacts`);

  for (let i = 0; i < allPagePngs.length; i++) {
    const up = await safeUpload({
      apiBase, token, jobId: job.id,
      filePath: path.join(outDir, allPagePngs[i]),
      kind: "png",
      metadata: { source: "illustrator", page_index: i + 1, total_pages: allPagePngs.length },
    });
    if (up) outputs.push(up);
  }
  if (allPagePngs.length === 0) {
    const png = await safeUpload({
      apiBase, token, jobId: job.id,
      filePath: path.join(outDir, "preview.png"),
      kind: "png",
      metadata: { source: "illustrator", page_index: 1, total_pages: 1 },
    });
    if (png) outputs.push(png);
  }

  const pdf = await safeUpload({
    apiBase, token, jobId: job.id,
    filePath: path.join(outDir, "master.pdf"),
    kind: "pdf",
    metadata: { source: "illustrator", page_count: allPagePngs.length || 1 },
  });
  if (pdf) outputs.push(pdf);

  const ai = await safeUpload({
    apiBase, token, jobId: job.id,
    filePath: path.join(outDir, "editable.ai"),
    kind: "ai",
    metadata: { source: "illustrator", editable: true },
  });
  if (ai) outputs.push(ai);

  if (await fs.stat(zipPath).then(() => true).catch(() => false)) {
    const pkg = await safeUpload({
      apiBase, token, jobId: job.id,
      filePath: zipPath, kind: "package",
      metadata: {
        source: "illustrator",
        page_count: allPagePngs.length || 1,
        contents: ["editable.ai", "master.pdf", "preview.png", ...allPagePngs, "Links/", "Fonts/", "manifest.json", "Report.txt"],
      },
    });
    if (pkg) outputs.push(pkg);
  }

  await progress("done", 100, "Outputs uploaded");
  return outputs;
}
