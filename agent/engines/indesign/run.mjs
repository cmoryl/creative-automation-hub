// InDesign engine adapter — mirrors the Illustrator adapter but exports an
// interactive PDF using InDesign's PDF preset.
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

function buildJsx({ templatePath, variables, outDir }) {
  const lines = Object.entries(variables || {})
    .filter(([, v]) => typeof v === "string" && !v.startsWith("#"))
    .map(
      ([name, value]) =>
        `swaps["${esc(name)}"] = "${esc(value)}";`,
    )
    .join("\n  ");

  return `
var swaps = {};
${lines}

var doc = app.open(File("${esc(templatePath)}"));

// Replace named text frames; fall back to script-label matches.
for (var i = 0; i < doc.textFrames.length; i++) {
  var tf = doc.textFrames[i];
  var key = tf.label || tf.name;
  if (swaps[key] !== undefined) {
    tf.contents = swaps[key];
  }
}

var pdfFile = File("${esc(path.join(outDir, "master.pdf"))}");
var preset = app.pdfExportPresets.itemByName("[High Quality Print]");
doc.exportFile(ExportFormat.PDF_TYPE, pdfFile, false, preset);

doc.close(SaveOptions.NO);
`;
}

function runScript(jsxPath) {
  return new Promise((resolve, reject) => {
    let cmd, args;
    if (process.platform === "darwin") {
      cmd = "osascript";
      args = ["-e", `tell application "Adobe InDesign 2024" to do script file "${jsxPath}" language javascript`];
    } else if (process.platform === "win32") {
      const ps = `$id = New-Object -ComObject InDesign.Application; $id.DoScript("${jsxPath.replace(/\\/g, "\\\\")}", 1246973031)`;
      cmd = "powershell";
      args = ["-NoProfile", "-Command", ps];
    } else {
      return reject(new Error(`unsupported OS for InDesign: ${process.platform}`));
    }
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`InDesign exited ${code}`)),
    );
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

export async function run(job, ctx) {
  const { apiBase, token, progress } = ctx;
  await progress("opening", 10, "Opening template in InDesign");
  const templatePath = resolveTemplatePath(job.template?.source_ref);
  await fs.access(templatePath).catch(() => {
    throw new Error(`Template not found: ${templatePath}`);
  });

  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), `lovable-job-${job.id}-`));
  const jsxPath = path.join(outDir, "render.jsx");
  await fs.writeFile(jsxPath, buildJsx({ templatePath, variables: job.variables, outDir }));

  await progress("rendering", 50, "Running ExtendScript in InDesign");
  await runScript(jsxPath);

  await progress("uploading", 85, "Uploading PDF");
  const pdf = await uploadOutput({
    apiBase, token, jobId: job.id,
    filePath: path.join(outDir, "master.pdf"),
    kind: "pdf",
    metadata: { source: "indesign" },
  });
  await progress("done", 100, "Complete");
  return [pdf];
}
