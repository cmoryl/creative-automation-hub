#!/usr/bin/env node
// /complete failure-path smoke test.
//
// Seeds a throwaway "queued" job via the Supabase service role, claims it via
// the agent endpoint, posts a structured failure to /complete, verifies the
// stored row has error_stage + error_detail, then deletes the seeded job.
//
// Requires:
//   LOVABLE_API_BASE             - e.g. https://creativeautomation.lovable.app
//   LOVABLE_AGENT_TOKEN          - real pairing token (gives us workspace_id)
//   SUPABASE_URL                 - https://<ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    - service role key (BYPASSES RLS — local use only)
//
// Optional:
//   LOVABLE_TEST_PROJECT_ID      - reuse an existing project in the workspace
//                                  (otherwise the script picks the first one)
//
// Usage:
//   node tests/smoke-complete-failure.mjs

import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.LOVABLE_API_BASE || "").replace(/\/$/, "");
const TOKEN = process.env.LOVABLE_AGENT_TOKEN;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BASE || !TOKEN || !SB_URL || !SB_KEY) {
  console.error("Missing env: LOVABLE_API_BASE, LOVABLE_AGENT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

async function call(path, init = {}) {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const text = await r.text();
  let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!r.ok) throw new Error(`${path} → ${r.status} ${typeof body === "string" ? body : JSON.stringify(body)}`);
  return body;
}

// 1. Identify which workspace this token belongs to.
const ping = await call("/api/public/agent/ping");
console.log(`agent: ${ping.agent}`);

// Look up workspace_id from the pairing (using service role).
const { data: pairings } = await sb
  .from("agent_pairings")
  .select("id, workspace_id, name")
  .eq("name", ping.agent)
  .limit(1);
const pairing = pairings?.[0];
if (!pairing) throw new Error("could not resolve workspace from pairing name");
const workspaceId = pairing.workspace_id;
console.log(`workspace: ${workspaceId}`);

// 2. Pick a project to attach the test job to.
let projectId = process.env.LOVABLE_TEST_PROJECT_ID || null;
if (!projectId) {
  const { data: projects } = await sb
    .from("projects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1);
  projectId = projects?.[0]?.id;
}
if (!projectId) throw new Error("no project available — set LOVABLE_TEST_PROJECT_ID or create one");
console.log(`project: ${projectId}`);

// 3. Seed a queued job for illustrator.
const seedLabel = `smoke-${Date.now()}`;
const { data: inserted, error: insErr } = await sb
  .from("jobs")
  .insert({
    project_id: projectId,
    workspace_id: workspaceId,
    engine: "illustrator",
    status: "queued",
    brief: { _smoke: true, label: seedLabel },
    variables: {},
    row_label: seedLabel,
  })
  .select("id")
  .single();
if (insErr) throw insErr;
const jobId = inserted.id;
console.log(`seeded job: ${jobId}`);

let cleanupOk = false;
try {
  // 4. Claim the job through the public agent endpoint.
  const claim = await call("/api/public/agent/claim", { method: "POST" });
  if (!claim?.job || claim.job.id !== jobId) {
    throw new Error(`claim returned ${claim?.job?.id ?? "nothing"}, expected ${jobId}`);
  }
  console.log("✓ claimed via /agent/claim");

  // 5. Post a rich failure payload to /complete.
  const errorDetail = {
    message: "Smoke-test forced failure",
    extendscript_log: "Error: Font not found: Helvetica Neue Bold\nat layer 'headline'",
    missing_fonts: ["Helvetica Neue Bold"],
    font_substitutions: [{ requested: "Helvetica Neue Bold", used: "Arial Bold" }],
    missing_links: ["product-shot.psd"],
    files: [{ name: "template.ai", path: "/tmp/template.ai", exists: true }],
    agent_version: "smoke-1.0.0",
  };

  await call("/api/public/agent/complete", {
    method: "POST",
    body: JSON.stringify({
      jobId,
      status: "failed",
      outputs: [],
      error: errorDetail.message,
      error_stage: "fonts",
      error_detail: errorDetail,
    }),
  });
  console.log("✓ posted /complete with structured failure");

  // 6. Verify the row stored both columns.
  const { data: row, error: readErr } = await sb
    .from("jobs")
    .select("status, error, error_stage, error_detail")
    .eq("id", jobId)
    .single();
  if (readErr) throw readErr;

  const checks = [
    ["status = failed", row.status === "failed"],
    ["error text persisted", row.error === errorDetail.message],
    ["error_stage = fonts", row.error_stage === "fonts"],
    ["error_detail.missing_fonts[0] = Helvetica Neue Bold",
      Array.isArray(row.error_detail?.missing_fonts) &&
      row.error_detail.missing_fonts[0] === "Helvetica Neue Bold"],
    ["error_detail.font_substitutions stored",
      Array.isArray(row.error_detail?.font_substitutions) &&
      row.error_detail.font_substitutions.length === 1],
  ];
  let allOk = true;
  for (const [name, ok] of checks) {
    console.log(`${ok ? "✓" : "✗"} ${name}`);
    if (!ok) allOk = false;
  }

  // 7. Back-compat: post a minimal /complete on a second seeded job (no error_detail).
  const { data: inserted2 } = await sb
    .from("jobs")
    .insert({
      project_id: projectId,
      workspace_id: workspaceId,
      engine: "illustrator",
      status: "queued",
      brief: { _smoke: true, label: `${seedLabel}-legacy` },
      variables: {},
      row_label: `${seedLabel}-legacy`,
    })
    .select("id")
    .single();
  const legacyId = inserted2.id;
  try {
    const claim2 = await call("/api/public/agent/claim", { method: "POST" });
    if (claim2?.job?.id !== legacyId) throw new Error("legacy claim mismatch");
    await call("/api/public/agent/complete", {
      method: "POST",
      body: JSON.stringify({ jobId: legacyId, status: "failed", outputs: [], error: "legacy-only" }),
    });
    const { data: legacyRow } = await sb
      .from("jobs")
      .select("status, error, error_stage, error_detail")
      .eq("id", legacyId)
      .single();
    const legacyOk =
      legacyRow.status === "failed" &&
      legacyRow.error === "legacy-only" &&
      !legacyRow.error_stage &&
      !legacyRow.error_detail;
    console.log(`${legacyOk ? "✓" : "✗"} legacy /complete still works (no error_stage/detail)`);
    if (!legacyOk) allOk = false;
  } finally {
    await sb.from("jobs").delete().eq("id", legacyId);
  }

  cleanupOk = true;
  if (!allOk) process.exit(1);
  console.log("\nAll /complete failure-path checks passed.");
} finally {
  // 8. Always clean up the seeded job.
  const { error: delErr } = await sb.from("jobs").delete().eq("id", jobId);
  if (delErr) console.warn(`cleanup warning: ${delErr.message}`);
  else if (cleanupOk) console.log(`cleaned up job ${jobId}`);
}
