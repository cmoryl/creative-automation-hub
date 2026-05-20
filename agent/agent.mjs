#!/usr/bin/env node
// Lovable Creative Automation — Local Bridge Agent
// Polls the platform for queued Illustrator / InDesign jobs and runs them
// against your existing engines/* code.
//
// Usage:
//   LOVABLE_AGENT_TOKEN=xxxx LOVABLE_API_BASE=https://your.lovable.app node agent.mjs

import { setTimeout as sleep } from "node:timers/promises";

const TOKEN = process.env.LOVABLE_AGENT_TOKEN;
const BASE = (process.env.LOVABLE_API_BASE || "").replace(/\/$/, "");
const POLL_MS = Number(process.env.LOVABLE_POLL_MS || 5000);

if (!TOKEN || !BASE) {
  console.error("Missing LOVABLE_AGENT_TOKEN or LOVABLE_API_BASE");
  process.exit(1);
}

const headers = {
  authorization: `Bearer ${TOKEN}`,
  "content-type": "application/json",
};

async function ping() {
  const r = await fetch(`${BASE}/api/public/agent/ping`, { headers });
  if (!r.ok) throw new Error(`ping ${r.status}`);
  return r.json();
}

async function claim() {
  const r = await fetch(`${BASE}/api/public/agent/claim`, { method: "POST", headers });
  if (!r.ok) throw new Error(`claim ${r.status}`);
  return (await r.json()).job;
}

async function complete(jobId, status, outputs = [], error) {
  await fetch(`${BASE}/api/public/agent/complete`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jobId, status, outputs, error }),
  });
}

// ---- Engine adapters --------------------------------------------------------
// Wire these to your existing engines/illustrator and engines/indesign code.
// Each adapter receives the job's brief + variables and must return an array of
// { kind, url, metadata? } describing the rendered outputs.

async function runIllustrator(job) {
  // TODO: import('./engines/illustrator/index.js').run(job)
  console.log(`[illustrator] would render job ${job.id}`);
  return [];
}

async function runInDesign(job) {
  // TODO: import('./engines/indesign/index.js').run(job)
  console.log(`[indesign] would render job ${job.id}`);
  return [];
}

async function execute(job) {
  switch (job.engine) {
    case "illustrator": return runIllustrator(job);
    case "indesign":    return runInDesign(job);
    default: throw new Error(`unsupported engine ${job.engine}`);
  }
}

// ---- Main loop --------------------------------------------------------------

async function main() {
  const me = await ping();
  console.log(`Paired as "${me.agent}" — polling every ${POLL_MS}ms`);
  while (true) {
    try {
      const job = await claim();
      if (job) {
        console.log(`→ job ${job.id} (${job.engine})`);
        try {
          const outputs = await execute(job);
          await complete(job.id, "succeeded", outputs);
          console.log(`✓ ${job.id}`);
        } catch (err) {
          console.error(`✗ ${job.id}`, err);
          await complete(job.id, "failed", [], String(err?.message ?? err));
        }
      }
    } catch (err) {
      console.error("poll error", err);
    }
    await sleep(POLL_MS);
  }
}

main();
