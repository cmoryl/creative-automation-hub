// Bridge Agent — status + template inventory reporter.
//
// Posts a richer "what does this machine look like" snapshot to
// /api/public/agent/status and per-template availability to
// /api/public/agent/templates/inventory. Called from agent.mjs at startup and
// on an interval. Read-only against the local templates folder.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEMPLATES_DIR =
  process.env.LOVABLE_AGENT_TEMPLATES ||
  path.resolve(__dirname, "./templates");

const AGENT_VERSION = process.env.LOVABLE_AGENT_VERSION || "1.1.0";

function which(cmd) {
  return new Promise((resolve) => {
    const finder = process.platform === "win32" ? "where" : "which";
    const child = spawn(finder, [cmd]);
    let out = "";
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.on("error", () => resolve(null));
    child.on("exit", (code) => resolve(code === 0 ? out.trim().split(/\r?\n/)[0] : null));
  });
}

async function detectApp(name) {
  if (process.platform === "darwin") {
    // /Applications/Adobe Illustrator 2025/Adobe Illustrator.app
    const apps = await fs.readdir("/Applications").catch(() => []);
    const match = apps.find((a) => a.toLowerCase().includes(name.toLowerCase()));
    return match ? { installed: true, version: match } : { installed: false };
  }
  if (process.platform === "win32") {
    // Best-effort: check Program Files
    const roots = ["C:/Program Files/Adobe", "C:/Program Files (x86)/Adobe"];
    for (const r of roots) {
      const dirs = await fs.readdir(r).catch(() => []);
      const match = dirs.find((d) => d.toLowerCase().includes(name.toLowerCase()));
      if (match) return { installed: true, version: match };
    }
    return { installed: false };
  }
  return { installed: false };
}

async function listFonts() {
  // macOS: /Library/Fonts + ~/Library/Fonts. Windows: C:\Windows\Fonts.
  const dirs =
    process.platform === "darwin"
      ? ["/Library/Fonts", `${os.homedir()}/Library/Fonts`, "/System/Library/Fonts"]
      : process.platform === "win32"
        ? ["C:/Windows/Fonts"]
        : ["/usr/share/fonts"];
  const all = new Set();
  for (const d of dirs) {
    const entries = await fs.readdir(d).catch(() => []);
    for (const e of entries) {
      if (/\.(ttf|otf|ttc|woff2?)$/i.test(e)) all.add(e.replace(/\.[^.]+$/, ""));
    }
  }
  return Array.from(all);
}

async function diskFreeMb() {
  try {
    if (process.platform === "win32") return null;
    const { execSync } = await import("node:child_process");
    const out = execSync(`df -m ${os.tmpdir()}`).toString().split("\n")[1] ?? "";
    const cols = out.trim().split(/\s+/);
    return Number(cols[3]) || null;
  } catch {
    return null;
  }
}

async function scanTemplatesDir() {
  // Return a map of filename -> { exists: true } for everything under
  // TEMPLATES_DIR (one level deep). The platform decides which template_ids
  // correspond to which filenames using bridge://templates/<file> source_refs.
  const entries = await fs.readdir(TEMPLATES_DIR).catch(() => []);
  const found = new Map();
  for (const e of entries) {
    if (/\.(ai|indd)$/i.test(e)) found.set(e, true);
  }
  return found;
}

export async function buildStatusPayload(currentJobId = null) {
  const [illustrator, indesign, fonts, diskMb] = await Promise.all([
    detectApp("Illustrator"),
    detectApp("InDesign"),
    listFonts(),
    diskFreeMb(),
  ]);
  const tplFiles = await scanTemplatesDir();
  return {
    host: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
    agent_version: AGENT_VERSION,
    apps: { illustrator, indesign },
    fonts_count: fonts.length,
    fonts_sample: fonts.slice(0, 50),
    disk_free_mb: diskMb,
    current_job_id: currentJobId,
    templates_seen: tplFiles.size,
  };
}

export async function postStatus(api, currentJobId = null) {
  const payload = await buildStatusPayload(currentJobId);
  try {
    await api("/api/public/agent/status", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("status post failed:", e.message);
  }
}

// Given the platform-side list of templates (id + source_ref), check whether
// each template's source file exists locally, plus best-effort font + linked
// asset checks against template.requirements.{fonts,links}.
//
// Linked-asset convention: InDesign + Illustrator users typically keep linked
// images alongside the document, often under a sibling "Links" folder
// (matches the Adobe "Package" default). We scan both the template dir root
// and any same-name "Links" subfolder so users get a real readiness signal
// for missing image links — not just fonts.
export async function postTemplateInventory(api, templates) {
  if (!Array.isArray(templates) || templates.length === 0) return;
  const found = await scanTemplatesDir();
  const fonts = await listFonts();
  // Loose-match font family: strip style suffix ("Inter Bold" → "inter") so
  // "Inter-Regular.ttf" on disk satisfies a "Inter" requirement.
  const fontSet = new Set();
  for (const f of fonts) {
    const lc = f.toLowerCase();
    fontSet.add(lc);
    fontSet.add(lc.replace(/[-_ ](regular|bold|italic|light|medium|semibold|thin|black|heavy|book|oblique)+$/i, "").trim());
  }
  const fontHas = (family) => {
    if (!family) return true;
    const lc = String(family).toLowerCase().trim();
    return fontSet.has(lc) || fontSet.has(lc.replace(/\s+/g, "-")) || fontSet.has(lc.replace(/\s+/g, ""));
  };

  // Cache directory listings of "Links" folders so we don't re-stat per template.
  const linksDirCache = new Map();
  const linksFor = async (dirAbs) => {
    if (linksDirCache.has(dirAbs)) return linksDirCache.get(dirAbs);
    const entries = await fs.readdir(dirAbs).catch(() => []);
    const set = new Set(entries.map((e) => e.toLowerCase()));
    linksDirCache.set(dirAbs, set);
    return set;
  };

  const items = [];
  for (const t of templates) {
    const m = String(t.source_ref || "").match(/^bridge:\/\/templates\/(.+)$/);
    if (!m) continue;
    const filename = m[1];
    const file_present = found.has(filename);

    const required = Array.isArray(t.requirements?.fonts) ? t.requirements.fonts : [];
    const fonts_missing = required.map((f) => f.family).filter((fam) => fam && !fontHas(fam));

    // Resolve linked-asset requirements against TEMPLATES_DIR and TEMPLATES_DIR/Links.
    const requiredLinks = Array.isArray(t.requirements?.links) ? t.requirements.links : [];
    const links_missing = [];
    if (requiredLinks.length > 0) {
      const rootLinks = await linksFor(TEMPLATES_DIR);
      const sideLinks = await linksFor(path.join(TEMPLATES_DIR, "Links"));
      for (const link of requiredLinks) {
        const name = typeof link === "string" ? link : link?.name;
        if (!name) continue;
        const lc = String(name).toLowerCase();
        const base = lc.split("/").pop();
        const ok = rootLinks.has(base) || sideLinks.has(base);
        if (!ok) links_missing.push(name);
      }
    }

    items.push({ template_id: t.id, file_present, fonts_missing, links_missing });
  }
  if (items.length === 0) return;
  try {
    await api("/api/public/agent/templates/inventory", {
      method: "POST",
      body: JSON.stringify({ items }),
    });
  } catch (e) {
    console.warn("template inventory post failed:", e.message);
  }
}

// Quick local helper used by engine adapters when a render fails — surfaces
// missing fonts, missing links, and a small set of well-known ExtendScript
// failure modes from an ExtendScript log so the /complete payload carries
// enough signal for the server-side retry classifier and the user-facing
// error report. Returns a structured detail object the agent merges into
// /api/public/agent/complete.
export function parseExtendscriptErrors(log) {
  if (!log) return {};
  const missing_fonts = Array.from(new Set(
    [...log.matchAll(/font (?:not found|missing|unavailable)[: ]+([^\n,]+)/gi)].map((m) => m[1].trim()),
  ));
  const missing_links = Array.from(new Set(
    [...log.matchAll(/(?:link|image|placed file) (?:not found|missing)[: ]+([^\n,]+)/gi)].map((m) => m[1].trim()),
  ));

  // Lightweight reason hinting — the server still re-runs the full classifier,
  // but a strong local hint lets transient/permanent decisions stay accurate
  // even if the raw log gets truncated en route.
  const hints = [];
  if (/permission denied|eacces|operation not permitted/i.test(log)) hints.push("permission_denied");
  if (/file (?:is )?(?:open|in use) in another (?:app|process)|locked by another/i.test(log)) hints.push("file_locked");
  if (/host application is busy|cannot communicate with .* (?:illustrator|indesign)/i.test(log)) hints.push("app_busy");
  if (/pdf (?:export )?preset (?:not found|missing|does not exist)/i.test(log)) hints.push("missing_pdf_preset");
  if (/color profile (?:not found|missing|mismatch)/i.test(log)) hints.push("color_profile");
  if (/layer (?:is )?locked|cannot modify locked/i.test(log)) hints.push("locked_layer");
  if (/(?:application )?(?:has )?(?:crashed|quit unexpectedly|stopped responding)/i.test(log)) hints.push("app_crash");

  return {
    missing_fonts: missing_fonts.length ? missing_fonts : undefined,
    missing_links: missing_links.length ? missing_links : undefined,
    reason_hints: hints.length ? hints : undefined,
    extendscript_log: log.slice(0, 20000),
  };
}

export { TEMPLATES_DIR, AGENT_VERSION };

// Expose `which` for use in agent.mjs if needed.
export { which };
