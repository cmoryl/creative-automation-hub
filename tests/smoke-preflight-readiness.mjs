#!/usr/bin/env node
// End-to-end preflight-readiness smoke test.
//
// Seeds a throwaway bridge:// template, posts an agent status snapshot and a
// template inventory row, then asserts that the data Preflight reads back
// (agent_status + template_agent_availability) is exactly what we sent.
// Cleans up the seeded template + availability + status row at the end.
//
// Requires:
//   LOVABLE_API_BASE             - e.g. https://creativeautomation.lovable.app
//   LOVABLE_AGENT_TOKEN          - real pairing token
//   SUPABASE_URL                 - https://<ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    - service role key (BYPASSES RLS)

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
console.log(`agent: ${ping.agent}`);

const { data: pairings } = await sb
  .from("agent_pairings")
  .select("id, workspace_id, name")
  .eq("name", ping.agent)
  .limit(1);
const pairing = pairings?.[0];
if (!pairing) throw new Error("could not resolve workspace from pairing name");
const { id: agentId, workspace_id: workspaceId } = pairing;
console.log(`agent_id: ${agentId}  workspace: ${workspaceId}`);

const seedTag = `smoke-${Date.now()}`;
const sourceRef = `bridge://templates/${seedTag}.ai`;
const requirements = {
  fonts: [{ family: "Inter", style: "Bold" }, { family: "Made-Up Font That Does Not Exist", style: "Regular" }],
  links: [{ name: "hero.psd" }],
  notes: "smoke test template",
};

// 1. Seed template directly (service role bypasses RLS).
const { data: tpl, error: tplErr } = await sb
  .from("templates")
  .insert({
    workspace_id: workspaceId,
    engine: "illustrator",
    name: `[smoke] ${seedTag}`,
    source_ref: sourceRef,
    requirements,
  })
  .select("id")
  .single();
if (tplErr) throw tplErr;
const templateId = tpl.id;
console.log(`seeded template: ${templateId}`);

let allOk = true;
try {
  // 2. Post a rich status snapshot.
  await call("/api/public/agent/status", {
    method: "POST",
    body: JSON.stringify({
      host: `preflight-smoke-${process.pid}`,
      platform: `${process.platform} ${process.arch}`,
      agent_version: "smoke-preflight-1.0",
      apps: {
        illustrator: { installed: true, version: "Adobe Illustrator 2025" },
        indesign: { installed: true, version: "Adobe InDesign 2025" },
      },
      fonts_count: 2,
      fonts_sample: ["Inter", "Helvetica Neue"],
      disk_free_mb: 50000,
      current_job_id: null,
      templates_seen: 1,
    }),
  });
  console.log("✓ posted /agent/status");

  // 3. Sanity: GET /agent/templates should include our seeded template.
  const list = await call("/api/public/agent/templates");
  const found = (list.templates ?? []).find((t) => t.id === templateId);
  if (!found) {
    console.log("✗ GET /agent/templates did not include seeded template");
    allOk = false;
  } else if (found.source_ref !== sourceRef) {
    console.log(`✗ source_ref mismatch: ${found.source_ref}`);
    allOk = false;
  } else {
    console.log("✓ GET /agent/templates returns seeded template");
  }

  // 4. Post inventory with one missing font + one missing link.
  await call("/api/public/agent/templates/inventory", {
    method: "POST",
    body: JSON.stringify({
      items: [
        {
          template_id: templateId,
          file_present: true,
          fonts_missing: ["Made-Up Font That Does Not Exist"],
          links_missing: ["hero.psd"],
        },
      ],
    }),
  });
  console.log("✓ posted /agent/templates/inventory");

  // 5. Read back what Preflight reads — agent_status + template_agent_availability.
  const { data: statusRow } = await sb
    .from("agent_status")
    .select("host, agent_version, fonts_count, apps")
    .eq("agent_id", agentId)
    .single();
  const statusOk =
    statusRow?.host?.startsWith("preflight-smoke-") &&
    statusRow.agent_version === "smoke-preflight-1.0" &&
    statusRow.fonts_count === 2 &&
    statusRow.apps?.illustrator?.installed === true;
  console.log(`${statusOk ? "✓" : "✗"} agent_status row matches`);
  if (!statusOk) allOk = false;

  const { data: avail } = await sb
    .from("template_agent_availability")
    .select("file_present, fonts_missing, links_missing")
    .eq("template_id", templateId)
    .eq("agent_id", agentId)
    .single();
  const availOk =
    avail?.file_present === true &&
    Array.isArray(avail.fonts_missing) &&
    avail.fonts_missing.length === 1 &&
    avail.fonts_missing[0] === "Made-Up Font That Does Not Exist" &&
    Array.isArray(avail.links_missing) &&
    avail.links_missing[0] === "hero.psd";
  console.log(`${availOk ? "✓" : "✗"} template_agent_availability row matches`);
  if (!availOk) allOk = false;

  // 6. Upsert behavior — re-post inventory clearing the missing items.
  await call("/api/public/agent/templates/inventory", {
    method: "POST",
    body: JSON.stringify({
      items: [
        { template_id: templateId, file_present: true, fonts_missing: [], links_missing: [] },
      ],
    }),
  });
  const { data: avail2 } = await sb
    .from("template_agent_availability")
    .select("fonts_missing, links_missing")
    .eq("template_id", templateId)
    .eq("agent_id", agentId)
    .single();
  const upsertOk =
    Array.isArray(avail2?.fonts_missing) && avail2.fonts_missing.length === 0 &&
    Array.isArray(avail2.links_missing) && avail2.links_missing.length === 0;
  console.log(`${upsertOk ? "✓" : "✗"} inventory upsert clears missing arrays`);
  if (!upsertOk) allOk = false;

  if (!allOk) process.exit(1);
  console.log("\nAll preflight-readiness checks passed.");
} finally {
  // 7. Cleanup. template_agent_availability has no FK; delete explicitly.
  await sb.from("template_agent_availability").delete().eq("template_id", templateId);
  await sb.from("templates").delete().eq("id", templateId);
  // Leave agent_status alone — there's only one row per agent and the real
  // agent will overwrite it on its next heartbeat.
  console.log("cleaned up seeded template + availability row");
}
