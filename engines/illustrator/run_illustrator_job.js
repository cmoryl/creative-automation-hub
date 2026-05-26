// Illustrator automation runner for Creative Automation Platform v3.
// Run via process.execPath with ELECTRON_RUN_AS_NODE=1.
// Required env: CAP_ENGINE_ROOT, CAP_WORKSPACE_ROOT
// Optional flag: --preflight (runs preflight_illustrator.jsx instead of case_study_versioner.jsx)

const fs = require("fs");
const path = require("path");

const engineRoot = process.env.CAP_ENGINE_ROOT;
const workspaceRoot = process.env.CAP_WORKSPACE_ROOT;
if (!engineRoot || !workspaceRoot) throw new Error("CAP_ENGINE_ROOT and CAP_WORKSPACE_ROOT must be set.");

const preflight = process.argv.includes("--preflight");
const templateArg = (process.argv.find(a => a.startsWith("--template=")) || "").replace("--template=", "");
const jobsDir = path.join(workspaceRoot, "jobs");
const jobPath = path.join(jobsDir, "active_job_illustrator.json");

// Resolve variant template IDs to their shared source .ai file via manifest.
// e.g. CASE_STUDY_LETTER_HEALTHCARE_v001 → CASE_STUDY_LETTER_MASTER_v001
function resolveTemplateId(templateId) {
  const manifestPath = path.join(engineRoot, "references", `${templateId}.manifest.json`);
  if (fs.existsSync(manifestPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (m.source_template) {
        return path.basename(m.source_template, path.extname(m.source_template));
      }
    } catch (e) { /* fall through */ }
  }
  return templateId;
}

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

// Preflight doesn't need a job file — it just opens the template and checks named objects
let job = { output_name: "preflight_check", content: {}, template: templateArg || "CASE_STUDY_LETTER_MASTER_v001" };
if (!preflight) {
  if (!fs.existsSync(jobPath)) throw new Error(`Missing active job file: ${jobPath}`);
  job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
  job.output_name = String(job.output_name || "creative_output").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  // Use manifest-derived required keys if available; fall back to master template defaults
  const requiredKeys = getManifestRequiredKeys(job.template) || ["TEXT_TITLE", "TEXT_CHALLENGE", "TEXT_SOLUTION", "TEXT_RESULTS"];
  for (const key of requiredKeys) {
    if (!job.content || !job.content[key]) throw new Error(`Missing required content field: ${key}`);
  }
}

// Resolve the template (handles variant IDs like HEALTHCARE/TECHNOLOGY → MASTER)
if (job.template) {
  const resolved = resolveTemplateId(job.template);
  if (resolved !== job.template) {
    console.log(`Template resolved: ${job.template} → ${resolved}`);
    job.template = resolved;
  }
}

const jsxTemplateName = preflight ? "preflight_illustrator.jsx" : "case_study_versioner.jsx";
const jsxTemplatePath = path.join(engineRoot, "scripts", jsxTemplateName);
if (!fs.existsSync(jsxTemplatePath)) throw new Error(`Missing JSX script: ${jsxTemplatePath}`);

// Compute organised output subdirectory: outputs/illustrator/{template}/{YYYY-MM-DD}
// This groups related files (AI + PDF + PNG) from the same export run into one folder.
if (!preflight) {
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const templateDir = (job.template || 'misc').replace(/[^a-zA-Z0-9_-]/g, '_');
  job.output_subdir = `outputs/illustrator/${templateDir}/${dateStr}`;
}
// Always ensure logs dir and the resolved output dir exist
const subsToCreate = preflight
  ? ["outputs/logs"]
  : [job.output_subdir, "outputs/logs"];
subsToCreate.forEach(sub => {
  fs.mkdirSync(path.join(workspaceRoot, sub), { recursive: true });
});

// Inject paths and job into JSX via template placeholders
let jsx = fs.readFileSync(jsxTemplatePath, "utf8");
const jobJson = JSON.stringify(job, null, 2);
const engineRootJson = JSON.stringify(engineRoot);
const workspaceRootJson = JSON.stringify(workspaceRoot);
jsx = jsx
  .split("/*__JOB_JSON__*/").join(jobJson)
  .split("/*__AUTOMATION_ROOT__*/").join(workspaceRootJson)
  .split("/*__ENGINE_ROOT__*/").join(engineRootJson)
  .split("/*__SHARED_ROOT__*/").join(workspaceRootJson);

const generatedJsxPath = path.join(jobsDir, "_generated_run.jsx");
fs.mkdirSync(jobsDir, { recursive: true });
fs.writeFileSync(generatedJsxPath, jsx, "utf8");

const appleScriptPath = path.join(engineRoot, "scripts", "run_illustrator.applescript");
if (!fs.existsSync(appleScriptPath)) throw new Error(`Missing AppleScript bridge: ${appleScriptPath}`);

// Determine expected log file path (written by the JSX)
const logFileName = preflight
  ? "illustrator_preflight_report.txt"
  : `${job.output_name}_changelog.txt`;
const logFilePath = path.join(workspaceRoot, "outputs", "logs", logFileName);

// Signal the main Electron process to run osascript directly (it has the Automation permission).
// The main process reads these tokens from stdout and handles the AppleScript call itself.
console.log(`JSX_READY:${generatedJsxPath}`);
console.log(`APPLESCRIPT:${appleScriptPath}`);
console.log(`LOG_PATH:${logFilePath}`);
console.log(`IS_PREFLIGHT:${preflight ? "1" : "0"}`);
