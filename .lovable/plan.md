# Chat-driven Multi-Engine Variation Flow

Goal: a user picks a template, chats with an AI agent to define the brief, then chooses ONE of three input modes the agent can drive — guided form, section-by-section stepper, or CSV upload — plus optional reference images. The system fans out a rendered "live file" per engine the template targets (Illustrator, InDesign, Canva, Figma).

## User flow

```text
Template page ─► "Create variations" tab

  ┌─────────────────────────┬──────────────────────────────┐
  │  AI chat (left)         │  Right rail (mode-switched)  │
  │                         │   ◯ Guided form              │
  │  Agent suggests mode    │   ◯ Section stepper          │
  │  based on user intent   │   ◯ CSV upload               │
  │                         │   + Reference images         │
  │                         │   + Engine multi-select      │
  └─────────────────────────┴──────────────────────────────┘
                     │
                     ▼ Dispatch
        rows × engines → jobs + live-file outputs
```

## Input modes (agent-selectable)

1. **Guided form** — flat form of all template variables, AI pre-fills values from the chat transcript, user reviews/edits, single "Generate variation" submit. Best for ONE variation.
2. **Section stepper** — variables grouped by template layer/section (e.g. `Header`, `Challenge`, `Solution`, `Stats`, `Quote`, `Footer`). Wizard-style: one section per step, progress bar, Back / Next / Skip. Agent can answer questions per section and auto-fill values as the user talks. Best for ONE rich variation built up deliberately.
3. **CSV upload** — drop a CSV; parser returns headers; agent auto-maps columns → template variable names; user confirms mapping; one variation per row. Best for batches.

The agent calls a `choose_input_mode` tool early in the chat (or the user clicks a mode chip) and the right rail swaps to the matching component.

## Pieces to build

1. **Storage bucket** `brief-uploads` (private) for CSV + reference images, RLS scoped to workspace members.
2. **Chat agent server fn** `briefAgentStream` (AI SDK + Lovable AI gateway, `google/gemini-3-flash-preview`) with tools:
   - `choose_input_mode({ mode: 'form'|'stepper'|'csv', reason })`
   - `propose_sections({ sections: [{ id, title, variables: string[] }] })` — agent groups template variables for stepper mode
   - `prefill_values({ values: Record<string,string> })` — agent fills the form / current step as the user talks
   - `propose_variations({ rows: [{ name, values }] })` — preview CSV-derived rows
   - `dispatch_variations({ rows, engines })` — creates jobs + outputs per engine
3. **CSV parser** server fn: upload → returns header + sample + auto-mapping suggestions.
4. **`dispatchVariations` server fn**: for each row × engine insert a `projects` row (named after row), a `jobs` row per engine, and a mock completed `outputs` row tagged with engine.
5. **`templates.$templateId.tsx`** — new default tab "Create" with:
   - left: AI Elements chat (`Conversation`, `Message`, `PromptInput`, `Shimmer`, `Tool`)
   - right: mode switcher + one of:
     - `<GuidedForm />` — flat fields, AI-prefilled
     - `<SectionStepper />` — wizard with progress + per-section fields
     - `<CsvDropzone />` — file input + column→variable mapping table
   - bottom: engine chip multi-select (`illustrator`, `indesign`, `canva`, `figma`), reference image dropzone, "Dispatch all" button
6. **Variations tab** — group outputs per row, one tile per engine with download link + engine badge.

## Data model deltas

- Add `jobs.row_label text` to group variations per source row.
- No new tables; reuse `projects` / `jobs` / `outputs`.

## Engine routing

- `illustrator` / `indesign` → `bridge://` source, queued for local agent; mock-completed if no live agent.
- `figma` / `canva` → cloud API stubs, also mock-completed (returns template preview as the "live file" URL with engine in metadata).

Real engine adapters stay stubbed — this pass wires the end-to-end UX, mode-switching, and dispatch graph so adapters can be swapped in later.

## Out of scope (this pass)

- Real Figma / Canva API rendering.
- Per-engine variable mapping overrides (same row values reused across engines).
- Brand-kit / asset library beyond uploaded reference images.
