// InDesign automation runner for Creative Automation Platform v3.
// Run via process.execPath with ELECTRON_RUN_AS_NODE=1.
// Required env: CAP_ENGINE_ROOT, CAP_WORKSPACE_ROOT
// Optional flag: --preflight (runs preflight_indesign.jsx instead of whitepaper_versioner.jsx)

const fs = require("fs");
const path = require("path");

const engineRoot = process.env.CAP_ENGINE_ROOT;
const workspaceRoot = process.env.CAP_WORKSPACE_ROOT;
if (!engineRoot || !workspaceRoot) throw new Error("CAP_ENGINE_ROOT and CAP_WORKSPACE_ROOT must be set.");

const preflight = process.argv.includes("--preflight");
const templateArg = (process.argv.find(a => a.startsWith("--template=")) || "").replace("--template=", "");
const jobsDir = path.join(workspaceRoot, "jobs");
const jobPath = path.join(jobsDir, "active_job_indesign.json");

/** Read required text field keys from the template's manifest (required: true, type: text). */
function getManifestRequiredKeys(templateId) {
  const manifestPath = path.join(engineRoot, "references", `${templateId}.manifest.json`);
  try {
    if (!fs.existsSync(manifestPath)) return null;
    const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (!m.editable_objects || typeof m.editable_objects !== "object") return null;
    const keys = Object.entries(m.editable_objects)
      .filter(([, v]) => v && v.required === true && v.type === "text")
      .map(([k]) => k);
    return keys.length > 0 ? keys : null;
  } catch (e) { return null; }
}

let job = { output_name: "preflight_check", content: {}, template: templateArg || "WHITEPAPER_LETTER_MASTER_v001" };
if (!preflight) {
  if (!fs.existsSync(jobPath)) throw new Error(`Missing active job file: ${jobPath}`);
  job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
  job.output_name = String(job.output_name || "indesign_output").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  const requiredKeys = getManifestRequiredKeys(job.template) || ["DOC_TITLE", "SECTION_EXECUTIVE_SUMMARY", "SECTION_BODY"];
  for (const key of requiredKeys) {
    if (!job.content || !job.content[key]) throw new Error(`Missing required content field: ${key}`);
  }
}

const jsxScriptName = preflight ? "preflight_indesign.jsx" : "whitepaper_versioner.jsx";
const jsxTemplatePath = path.join(engineRoot, "scripts", jsxScriptName);
if (!fs.existsSync(jsxTemplatePath)) throw new Error(`Missing JSX script: ${jsxTemplatePath}`);

// Compute organised output subdirectory: outputs/indesign/{template}/{YYYY-MM-DD}
if (!preflight) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const templateDir = (job.template || 'misc').replace(/[^a-zA-Z0-9_-]/g, '_');
  job.output_subdir = `outputs/indesign/${templateDir}/${dateStr}`;
}
const subsToCreate = preflight
  ? ["outputs/logs"]
  : [job.output_subdir, "outputs/logs"];
subsToCreate.forEach(sub => {
  fs.mkdirSync(path.join(workspaceRoot, sub), { recursive: true });
});

// Inject job + paths into JSX
let jsx = fs.readFileSync(jsxTemplatePath, "utf8");
const jobJson = JSON.stringify(job, null, 2);
const engineRootJson = JSON.stringify(engineRoot);
const workspaceRootJson = JSON.stringify(workspaceRoot);
jsx = jsx
  .split("/*__JOB_JSON__*/").join(jobJson)
  .split("/*__ENGINE_ROOT__*/").join(engineRootJson)
  .split("/*__SHARED_ROOT__*/").join(workspaceRootJson);

const generatedJsxPath = path.join(jobsDir, "_generated_indesign_run.jsx");
fs.mkdirSync(jobsDir, { recursive: true });
fs.writeFileSync(generatedJsxPath, jsx, "utf8");

const appleScriptPath = path.join(engineRoot, "scripts", "run_indesign.applescript");
if (!fs.existsSync(appleScriptPath)) throw new Error(`Missing AppleScript bridge: ${appleScriptPath}`);

// Expected log file (written by JSX)
const logFileName = preflight
  ? "indesign_preflight_report.txt"
  : `${job.output_name}_changelog.txt`;
const logFilePath = path.join(workspaceRoot, "outputs", "logs", logFileName);

// Signal the main Electron process to run osascript directly (it has the Automation permission).
console.log(`JSX_READY:${generatedJsxPath}`);
console.log(`APPLESCRIPT:${appleScriptPath}`);
console.log(`LOG_PATH:${logFilePath}`);
console.log(`IS_PREFLIGHT:${preflight ? "1" : "0"}`);
