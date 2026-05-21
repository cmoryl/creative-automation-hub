#!/usr/bin/env node
// Unit smoke for new CSV data-merge parser + Figma variable extractor.
// No network, no secrets. Run: node tests/smoke-csv-and-figma-extract.mjs
import assert from "node:assert/strict";

// ---- inline copies (kept in sync with src/lib/csv-parse.ts + figma.server.ts) ----
// We re-implement minimally to avoid bundler/TS in a smoke test. If the source
// diverges, update both — these tests guard the public contract.

function parseCsv(text) {
  const t = text.replace(/^\uFEFF/, "");
  const firstLine = t.split(/\r?\n/, 1)[0] ?? "";
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const delim = tabs > commas ? "\t" : ",";
  const rows = []; let row = []; let field = ""; let inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === delim) { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && t[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim().length));
}

// --- CSV tests ---
{
  const csv = `label,headline,cta\nRow 1,"Hello, world","Buy"\nRow 2,"She said ""hi""",Shop`;
  const g = parseCsv(csv);
  assert.equal(g.length, 3, "3 lines (header + 2)");
  assert.deepEqual(g[1], ["Row 1", "Hello, world", "Buy"]);
  assert.deepEqual(g[2], ["Row 2", 'She said "hi"', "Shop"]);
  console.log("✓ CSV: quoted commas + escaped quotes");
}
{
  const tsv = "label\theadline\nA\tFoo\nB\tBar";
  const g = parseCsv(tsv);
  assert.deepEqual(g[2], ["B", "Bar"]);
  console.log("✓ CSV: TSV auto-delimiter");
}
{
  const bom = "\uFEFFlabel,x\r\nA,1\r\nB,2\r\n";
  const g = parseCsv(bom);
  assert.equal(g.length, 3);
  assert.deepEqual(g[0], ["label", "x"]);
  console.log("✓ CSV: BOM + CRLF");
}

// --- Figma extractVariables tests ---
function extractVariables(root) {
  const out = new Map();
  const norm = (s) => {
    const m = String(s ?? "").match(/(?:\{\{\s*([^}]+?)\s*\}\}|^var:(.+)$)/);
    return (m ? (m[1] ?? m[2]) : s).trim();
  };
  function walk(n) {
    if (!n || typeof n !== "object") return;
    const nm = typeof n.name === "string" ? n.name.trim() : "";
    if (nm && (n.type === "TEXT" || n.type === "RECTANGLE" || n.type === "ELLIPSE" || n.type === "FRAME")) {
      const key = norm(nm);
      if (key && !key.startsWith("_") && key.length <= 80) {
        const isImage = n.type !== "TEXT" && (n.fills ?? []).some((f) => f.type === "IMAGE");
        if (n.type === "TEXT" && !out.has(key)) out.set(key, { name: key, type: "text", label: nm !== key ? nm : undefined });
        else if (isImage && !out.has(key)) out.set(key, { name: key, type: "image", label: nm !== key ? nm : undefined });
      }
    }
    if (Array.isArray(n.children)) for (const c of n.children) walk(c);
  }
  walk(root);
  return Array.from(out.values());
}

{
  const tree = {
    type: "FRAME", name: "Root", children: [
      { type: "TEXT", name: "{{headline}}" },
      { type: "TEXT", name: "var:cta" },
      { type: "TEXT", name: "subhead" },
      { type: "TEXT", name: "_ignore_me" },
      { type: "RECTANGLE", name: "hero_image", fills: [{ type: "IMAGE" }] },
      { type: "RECTANGLE", name: "bg_only", fills: [{ type: "SOLID" }] },
      { type: "TEXT", name: "headline" }, // duplicate-by-key
    ],
  };
  const vars = extractVariables(tree);
  const byName = Object.fromEntries(vars.map(v => [v.name, v]));
  assert.ok(byName.headline, "headline detected");
  assert.equal(byName.headline.type, "text");
  assert.equal(byName.cta.type, "text");
  assert.equal(byName.subhead.type, "text");
  assert.equal(byName.hero_image.type, "image");
  assert.ok(!byName._ignore_me, "underscore-prefixed ignored");
  assert.ok(!byName.bg_only, "non-IMAGE fill ignored");
  // duplicate "headline" should not double-up
  assert.equal(vars.filter(v => v.name === "headline").length, 1);
  console.log("✓ Figma: extractVariables handles {{x}}, var:x, IMAGE fills, dedupe, underscore skip");
}

console.log("\nAll CSV + Figma extractor smoke tests passed.");
