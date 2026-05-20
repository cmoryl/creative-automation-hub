# Chat-driven Multi-Engine Variation Flow

Goal: a user picks a template, chats with an AI agent to define the brief, optionally drops a CSV of rows (one variation per row) and reference images, and the system fans out a rendered "live file" for each engine the template targets (Illustrator, InDesign, Canva, Figma).

## User flow

```text
Template page  ─►  "Create variations" tab
                  ┌──────────────────────────────┐
                  │  Chat panel       │ Inputs   │
                  │  (AI agent)       │  • CSV   │
                  │                   │  • Imgs  │
                  │                   │  • Engines│
                  └──────────────────────────────┘
                  AI extracts → structured rows  → Dispatch
                                                    ├─ illustrator job
                                                    ├─ indesign  job
                                                    ├─ canva     job
                                                    └─ figma     job
                  Each row × engine = 1 job + 1 live-file output
```

## Pieces to build

1. **Storage bucket** `brief-uploads` (private) for CSV + reference images, RLS scoped to workspace members.
2. **Chat agent server fn** `briefAgentStream` (AI SDK + Lovable AI gateway, `google/gemini-3-flash-preview`) with tools:
   - `propose_variations({ rows: [{ name, values: Record<string,string> }] })` — preview structured rows
   - `dispatch_variations({ rows, engines: ('illustrator'|'indesign'|'canva'|'figma')[] })` — creates jobs + outputs per engine
3. **CSV parser** server fn: upload → returns header + sample rows, auto-maps columns to template variable names.
4. **`dispatchVariations` server fn**: for each row × engine, insert a `projects` row (named after row), a `jobs` row per engine, and a mock completed `outputs` row with engine-tagged live-file URL (uses template `preview_url` placeholder until real bridge runs).
5. **`templates.$templateId.tsx`** — add new default tab "Create" with:
   - left: AI Elements chat (`Conversation`, `Message`, `PromptInput`, `Shimmer`, `Tool`)
   - right: dropzone for CSV + images, engine multi-select chip group, "Dispatch all" button
6. **Variations tab** — group outputs per row, show one tile per engine with download link + engine badge.

## Data model deltas

- Add column `jobs.row_label text` so variations can be grouped per source row.
- No new tables; reuse `projects` / `jobs` / `outputs`.

## Engine routing

- `illustrator` / `indesign` → `bridge://` source, queued for local agent; mocked-completed if no live agent (as today).
- `figma` / `canva` → cloud API jobs, also mock-completed for now (returns template preview as the "live file" URL with engine in metadata).

Real engine adapters stay stubbed — this PR wires the end-to-end UX and dispatch graph so adapters can be swapped in later.

## Out of scope (this pass)

- Real Figma / Canva API rendering (mocked output URL for now).
- Per-engine variable mapping overrides (uses same row values across engines).
- Brand-kit / asset library reuse beyond uploaded images.
