#!/usr/bin/env node
// Smoke test for the bridge-agent endpoints introduced in the render-reliability sprint.
//
// Hits:
//   GET  /api/public/agent/ping
//   POST /api/public/agent/heartbeat
//   POST /api/public/agent/status
//   GET  /api/public/agent/templates
//   POST /api/public/agent/templates/inventory
//   POST /api/public/agent/claim                (read-only-ish: only claims if a job is queued)
//
// Auth: pass LOVABLE_AGENT_TOKEN (a real pairing token) + LOVABLE_API_BASE.
// Does NOT call /complete (would mutate a real job). Prints a pass/fail table.
//
// Usage:
//   LOVABLE_API_BASE=https://creativeautomation.lovable.app \
//   LOVABLE_AGENT_TOKEN=xxxxx \
//   node tests/smoke-agent-endpoints.mjs

const BASE = (process.env.LOVABLE_API_BASE || "").replace(/\/$/, "");
const TOKEN = process.env.LOVABLE_AGENT_TOKEN;

if (!BASE || !TOKEN) {
  console.error("Set LOVABLE_API_BASE and LOVABLE_AGENT_TOKEN");
  process.exit(2);
}

const headers = {
  authorization: `Bearer ${TOKEN}`,
  "content-type": "application/json",
};

const results = [];

async function step(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, detail });
    console.log(`✓ ${name}  (${Date.now() - t0}ms)`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, detail: String(e?.message ?? e) });
    console.log(`✗ ${name}  (${Date.now() - t0}ms)\n   ${e?.message ?? e}`);
  }
}

async function call(path, init = {}) {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const text = await r.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!r.ok) throw new Error(`${path} → ${r.status} ${typeof body === "string" ? body : JSON.stringify(body)}`);
  return body;
}

async function callExpect(path, init, expectedStatus) {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...(init?.headers || {}) } });
  if (r.status !== expectedStatus) {
    const t = await r.text().catch(() => "");
    throw new Error(`${path} → ${r.status} (expected ${expectedStatus}) ${t}`);
  }
  return r.status;
}

await step("auth: ping without token → 401", () =>
  callExpect("/api/public/agent/ping", { method: "GET" }, 401));

await step("auth: ping with bad token → 401", () =>
  callExpect("/api/public/agent/ping", {
    method: "GET",
    headers: { authorization: "Bearer not-a-real-token" },
  }, 401));

let agentName = null;
await step("GET /api/public/agent/ping", async () => {
  const r = await call("/api/public/agent/ping");
  agentName = r?.agent ?? null;
  return r;
});

await step("POST /api/public/agent/heartbeat", () =>
  call("/api/public/agent/heartbeat", {
    method: "POST",
    body: JSON.stringify({ engines: ["illustrator", "indesign"] }),
  }));

await step("POST /api/public/agent/status (rich snapshot)", () =>
  call("/api/public/agent/status", {
    method: "POST",
    body: JSON.stringify({
      host: `smoke-test-${process.pid}`,
      platform: `${process.platform} ${process.arch}`,
      agent_version: "smoke-1.0.0",
      apps: {
        illustrator: { installed: true, version: "Adobe Illustrator 2025" },
        indesign: { installed: false },
      },
      fonts_count: 3,
      fonts_sample: ["Inter", "Helvetica Neue", "JetBrains Mono"],
      disk_free_mb: 123456,
      current_job_id: null,
      templates_seen: 0,
    }),
  }));

await step("POST /api/public/agent/status (rejects bad body)", () =>
  callExpect("/api/public/agent/status", {
    method: "POST",
    headers,
    body: JSON.stringify({ fonts_count: -1 }),
  }, 400));

let templates = [];
await step("GET /api/public/agent/templates", async () => {
  const r = await call("/api/public/agent/templates");
  templates = Array.isArray(r?.templates) ? r.templates : [];
  return { count: templates.length, sample: templates.slice(0, 3).map((t) => ({ id: t.id, ref: t.source_ref })) };
});

await step("POST /api/public/agent/templates/inventory (empty)", () =>
  call("/api/public/agent/templates/inventory", {
    method: "POST",
    body: JSON.stringify({ items: [] }),
  }));

if (templates.length > 0) {
  await step("POST /api/public/agent/templates/inventory (real template)", () =>
    call("/api/public/agent/templates/inventory", {
      method: "POST",
      body: JSON.stringify({
        items: [
          {
            template_id: templates[0].id,
            file_present: true,
            fonts_missing: [],
            links_missing: [],
          },
        ],
      }),
    }));
} else {
  console.log("• skipped real-template inventory (workspace has no bridge:// templates)");
}

await step("POST /api/public/agent/templates/inventory (foreign template id ignored)", () =>
  call("/api/public/agent/templates/inventory", {
    method: "POST",
    body: JSON.stringify({
      items: [
        {
          template_id: "00000000-0000-0000-0000-000000000000",
          file_present: false,
          fonts_missing: [],
          links_missing: [],
        },
      ],
    }),
  }));

await step("POST /api/public/agent/claim (peek)", async () => {
  const r = await call("/api/public/agent/claim", { method: "POST" });
  return { claimed: !!r?.job, jobId: r?.job?.id ?? null };
});

// ---- summary ----
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
console.log("");
console.log(`Agent: ${agentName ?? "(unknown)"}  Base: ${BASE}`);
console.log(`Result: ${pass}/${results.length} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nFailures:");
  for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}: ${r.detail}`);
  process.exit(1);
}
