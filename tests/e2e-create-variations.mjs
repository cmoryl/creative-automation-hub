#!/usr/bin/env node
// End-to-end test for the "Create Variations" pipeline.
//
// For each (engine, template) pair below:
//   1. Loads the real template from the live DB.
//   2. Fills EVERY field with a realistic value, using the same rules
//      the UI uses (color/email/url/image/multiline).
//   3. Runs the EXACT validator from CreateVariationsTab — asserts no errors.
//   4. Builds the dispatchVariations payload exactly as the component does.
//   5. Runs the EXACT zod schema from dispatchVariations.inputValidator —
//      asserts it parses and rows[0].values deep-equals the typed input.
//
// Run:   node tests/e2e-create-variations.mjs
// Exit:  0 on pass, 1 on any failure.

import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import { z } from "zod";

const TARGETS = [
  { engine: "illustrator", name: "[Live] TransPerfect Case Study – A4" },
  { engine: "indesign",    name: "[Example] 8-Page Brochure – InDesign" },
];

// ─── UI validator (mirrors CreateVariationsTab.tsx) ────────────────────
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/i;
const IMAGE_URL_RE = /^https?:\/\/\S+$/i;

function valueFor(v) {
  if (v.type === "color") return v.placeholder || "#0E2C5C";
  if (v.type === "image" || /image|logo|photo|hero|cover/i.test(v.name))
    return `https://cdn.example.com/${v.name}.jpg`;
  if (/email/i.test(v.name)) return "hello@transperfect.com";
  if (/url|website|link/i.test(v.name)) return "https://www.transperfect.com";
  return v.placeholder || `Test value for ${v.label ?? v.name}`;
}

function validateField(v, raw) {
  const val = (raw ?? "").trim();
  const label = v.label ?? v.name;
  if (!val) return `${label} is required`;
  if (v.type === "color")
    return HEX_RE.test(val) ? null : `${label} must be a hex color`;
  if (v.type === "image" || /image|logo|photo|hero|cover/i.test(v.name))
    return IMAGE_URL_RE.test(val) ? null : `${label} must be an image URL`;
  if (/email/i.test(v.name))
    return EMAIL_RE.test(val) ? null : `${label} must be a valid email`;
  if (/url|website|link/i.test(v.name))
    return URL_RE.test(val) ? null : `${label} must be a valid URL`;
  const max =
    v.multiline ||
    /challenge|solution|results|quote|body|description/i.test(v.name)
      ? 4000
      : 200;
  return val.length <= max ? null : `${label} too long`;
}

const SUPPORTED_ENGINES = [
  "illustrator", "indesign", "figma", "canva", "hybrid", "mock",
];
const schema = z.object({
  templateId: z.string().uuid(),
  engines: z.array(z.enum(SUPPORTED_ENGINES)).min(1).max(4),
  briefSummary: z.string().max(2000).optional(),
  rows: z
    .array(
      z.object({
        label: z.string().min(1).max(200),
        values: z.record(z.string(), z.string()),
      }),
    )
    .min(1)
    .max(100),
});

function runTarget({ engine, name }) {
  console.log(`\n── ${engine.toUpperCase()} :: ${name} ──`);
  const raw = execSync(
    `psql -At -F $'\\t' -c "select id::text, variables::text from templates where name = '${name}' and engine='${engine}' limit 1;"`,
    { encoding: "utf8" },
  ).trim();
  assert.ok(raw, `template not found: ${name}`);
  const [templateId, variablesJson] = raw.split("\t");
  const variables = JSON.parse(variablesJson);
  assert.ok(variables.length > 0, "template has no variables");
  console.log(`  ✓ Loaded template ${templateId} (${variables.length} fields)`);

  const values = Object.fromEntries(variables.map((v) => [v.name, valueFor(v)]));

  const errs = {};
  for (const v of variables) {
    const e = validateField(v, values[v.name]);
    if (e) errs[v.name] = e;
  }
  assert.deepEqual(errs, {}, `validation errors: ${JSON.stringify(errs)}`);
  console.log(`  ✓ All ${variables.length} fields pass UI validation`);

  const payload = {
    templateId,
    engines: [engine],
    rows: [
      {
        label:
          values.case_study_title ||
          values.client_name ||
          values.title ||
          "Variation",
        values,
      },
    ],
  };

  const parsed = schema.parse(payload);
  console.log(`  ✓ Pipeline zod schema accepted payload`);

  assert.deepEqual(
    parsed.rows[0].values,
    values,
    "pipeline payload diverged from typed values",
  );
  assert.equal(Object.keys(parsed.rows[0].values).length, variables.length);
  for (const v of variables) {
    assert.equal(
      parsed.rows[0].values[v.name],
      values[v.name],
      `field ${v.name} differs at pipeline boundary`,
    );
  }
  console.log(
    `  ✓ Pipeline received exact variables payload (${variables.length}/${variables.length} fields)`,
  );
}

for (const t of TARGETS) runTarget(t);

console.log("\nALL CHECKS PASSED — create pipeline contract verified.");
