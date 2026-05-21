#!/usr/bin/env node
// Lovable Creative Automation — Local Bridge Agent
// Polls the platform for queued Illustrator / InDesign jobs and runs them
// against your installed Adobe apps via ExtendScript.

import { setTimeout as sleep } from "node:timers/promises";
import { run as runIllustrator } from "./engines/illustrator/run.mjs";
import { run as runInDesign } from "./engines/indesign/run.mjs";
import { postStatus, postTemplateInventory } from "./status.mjs";

const TOKEN = process.env.LOVABLE_AGENT_TOKEN;
const BASE = (process.env.LOVABLE_API_BASE || "").replace(/\/$/, "");
const POLL_MS = Number(process.env.LOVABLE_POLL_MS || 5000);
const ENGINES = (process.env.LOVABLE_AGENT_ENGINES || "illustrator,indesign")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!TOKEN || !BASE) {
  console.error("Missing LOVABLE_AGENT_TOKEN or LOVABLE_API_BASE");
  process.exit(1);
}

const headers = {
  authorization: `Bearer ${TOKEN}`,
  "content-type": "application/json",
};

async function api(path, init = {}) {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${path} ${r.status} ${await r.text().catch(() => "")}`);
  return r.status === 204 ? null : r.json();
}

const ping = () => api("/api/public/agent/ping");
const heartbeat = () => api("/api/public/agent/heartbeat", {
  method: "POST",
  body: JSON.stringify({ engines: ENGINES }),
});
const claim = async () => (await api("/api/public/agent/claim", { method: "POST" })).job;

async function reportProgress(jobId, stage, percent, message) {
  try {
    await api("/api/public/agent/progress", {
      method: "POST",
      body: JSON.stringify({ jobId, stage, percent, message }),
    });
  } catch (e) {
    console.warn(`progress ping failed: ${e.message}`);
  }
}

async function complete(jobId, status, outputs = [], error, extras = {}) {
  await api("/api/public/agent/complete", {
    method: "POST",
    body: JSON.stringify({ jobId, status, outputs, error, ...extras }),
  });
}


function pickEngine(name) {
  switch (name) {
    case "illustrator": return runIllustrator;
    case "indesign":    return runInDesign;
    default: throw new Error(`unsupported engine ${name}`);
  }
}

async function main() {
  const me = await ping();
  console.log(`Paired as "${me.agent}" — engines [${ENGINES.join(", ")}] — polling every ${POLL_MS}ms`);

  // Heartbeat loop runs independently of job polling.
  setInterval(() => {
    heartbeat().catch((e) => console.warn("heartbeat:", e.message));
  }, Math.min(POLL_MS, 10000));

  // Rich status + template inventory snapshot. Runs at startup and every 5 min.
  const refreshStatus = async (currentJobId = null) => {
    await postStatus(api, currentJobId);
    try {
      const res = await api("/api/public/agent/templates");
      if (res?.templates) await postTemplateInventory(api, res.templates);
    } catch (e) {
      console.warn("template inventory refresh failed:", e.message);
    }
  };
  refreshStatus().catch(() => {});
  setInterval(() => refreshStatus().catch(() => {}), 5 * 60 * 1000);

  while (true) {
    try {
      const job = await claim();
      if (job) {
        console.log(`→ job ${job.id} (${job.engine})`);
        const ctx = {
          apiBase: BASE,
          token: TOKEN,
          progress: (stage, percent, message) =>
            reportProgress(job.id, stage, percent, message),
        };
        try {
          await reportProgress(job.id, "claimed", 5, `Picked up by local agent (${job.engine})`);
          const runner = pickEngine(job.engine);
          const outputs = await runner(job, ctx);
          await complete(job.id, "succeeded", outputs);
          console.log(`✓ ${job.id} — ${outputs.length} output(s)`);
        } catch (err) {
          const msg = String(err?.stack ?? err?.message ?? err);
          console.error(`✗ ${job.id}`, msg);
          await reportProgress(job.id, "failed", 100, msg.split("\n")[0]).catch(() => {});
          await complete(job.id, "failed", [], msg).catch(() => {});
        }
      }
    } catch (err) {
      console.error("poll error", err.message);
    }
    await sleep(POLL_MS);
  }
}

main().catch((e) => {
  console.error("fatal", e);
  process.exit(1);
});
