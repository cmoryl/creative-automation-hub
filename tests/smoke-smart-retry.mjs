#!/usr/bin/env node
// Smart-retry smoke test.
//
// Verifies the /complete + /claim retry pipeline:
//   1. Seeded job → claim → /complete with a TRANSIENT failure (network timeout).
//      Asserts row goes back to status='queued' with retry_count=1,
//      next_retry_at in the future, transient=true, assigned_agent cleared.
//   2. Force next_retry_at into the past, claim again, /complete with a
//      PERMANENT failure (missing font). Asserts row is failed,
//      retry_count=1 (not incremented), transient=false.
//   3. Cleans up the seeded job.
//
// Requires the same env as smoke-complete-failure.mjs.

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

const ping = await call("/api/public/agent/ping");
const { data: pairings } = await sb
  .from("agent_pairings").select("workspace_id, name").eq("name", ping.agent).limit(1);
const workspaceId = pairings?.[0]?.workspace_id;
if (!workspaceId) throw new Error("could not resolve workspace from pairing");

let projectId = process.env.LOVABLE_TEST_PROJECT_ID || null;
if (!projectId) {
  const { data: projects } = await sb
    .from("projects").select("id").eq("workspace_id", workspaceId).limit(1);
  projectId = projects?.[0]?.id;
}
if (!projectId) throw new Error("no project available — set LOVABLE_TEST_PROJECT_ID");

const seedLabel = `retry-smoke-${Date.now()}`;
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
    max_retries: 1,
  })
  .select("id").single();
if (insErr) throw insErr;
const jobId = inserted.id;
console.log(`seeded job: ${jobId}`);

let allOk = true;
const check = (name, ok) => {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) allOk = false;
};

try {
  // --- Round 1: transient failure → requeued ---
  const claim1 = await call("/api/public/agent/claim", { method: "POST" });
  if (claim1?.job?.id !== jobId) throw new Error(`round-1 claim mismatch (got ${claim1?.job?.id})`);

  const resp1 = await call("/api/public/agent/complete", {
    method: "POST",
    body: JSON.stringify({
      jobId,
      status: "failed",
      outputs: [],
      error: "ETIMEDOUT: upstream connection timed out after 30s",
      error_stage: "export",
    }),
  });
  check("round-1 response.requeued = true", resp1.requeued === true);
  check("round-1 response.retry_reason = timeout", resp1.retry_reason === "timeout");
  check("round-1 response.next_retry_at present", typeof resp1.next_retry_at === "string");

  const { data: row1 } = await sb
    .from("jobs")
    .select("status, retry_count, transient, next_retry_at, assigned_agent_id, claimed_at")
    .eq("id", jobId).single();
  check("round-1 status = queued", row1.status === "queued");
  check("round-1 retry_count = 1", row1.retry_count === 1);
  check("round-1 transient = true", row1.transient === true);
  check("round-1 next_retry_at in the future",
    !!row1.next_retry_at && new Date(row1.next_retry_at).getTime() > Date.now());
  check("round-1 agent slot freed", row1.assigned_agent_id === null && row1.claimed_at === null);

  // Confirm /claim won't return the job while next_retry_at is in the future.
  const claimEarly = await call("/api/public/agent/claim", { method: "POST" });
  check("claim respects next_retry_at (no job returned)", !claimEarly?.job || claimEarly.job.id !== jobId);

  // --- Round 2: force next_retry_at into the past, then permanent failure ---
  await sb.from("jobs")
    .update({ next_retry_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", jobId);

  const claim2 = await call("/api/public/agent/claim", { method: "POST" });
  check("round-2 reclaim after backoff elapsed", claim2?.job?.id === jobId);

  const resp2 = await call("/api/public/agent/complete", {
    method: "POST",
    body: JSON.stringify({
      jobId,
      status: "failed",
      outputs: [],
      error: "Font not found",
      error_stage: "fonts",
      error_detail: { missing_fonts: ["Helvetica Neue Bold"] },
    }),
  });
  check("round-2 response.requeued = false", resp2.requeued === false);
  check("round-2 response.retry_reason = missing_font", resp2.retry_reason === "missing_font");

  const { data: row2 } = await sb
    .from("jobs")
    .select("status, retry_count, transient, next_retry_at, completed_at")
    .eq("id", jobId).single();
  check("round-2 status = failed", row2.status === "failed");
  check("round-2 retry_count still = 1", row2.retry_count === 1);
  check("round-2 transient = false", row2.transient === false);
  check("round-2 next_retry_at cleared", row2.next_retry_at === null);
  check("round-2 completed_at stamped", !!row2.completed_at);

  if (!allOk) process.exit(1);
  console.log("\nAll smart-retry checks passed.");
} finally {
  const { error: delErr } = await sb.from("jobs").delete().eq("id", jobId);
  if (delErr) console.warn(`cleanup warning: ${delErr.message}`);
  else console.log(`cleaned up job ${jobId}`);
}
