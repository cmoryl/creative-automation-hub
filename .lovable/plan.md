# Batch Rendering

Add three coordinated batch capabilities on top of the existing single-row dispatch.

## 1. Form batch mode (in CreateVariationsTab)

- New "Batch" tab next to **Single brief** / **Bulk CSV**.
- Editable rows table: each row exposes every template field; rows can be **duplicated**, **deleted**, or **reset**.
- "Add row" + "Duplicate last" actions; first row prefilled from `brandPrefill`.
- Same `validateField` validation as form mode; errors shown inline per cell.
- Dispatches via the new `dispatchBatch` server fn (one batch_id, N rows × M engines).

## 2. Multi-template batch (new route `/templates/batch`)

- New page reached from a "Batch dispatch" button on `/templates`.
- Step 1 — pick templates (checkbox list grouped by engine).
- Step 2 — pick engines (intersection of supported engines for the selected templates).
- Step 3 — author rows in a shared editable table.
  - Columns = **union** of variable names across selected templates.
  - Each template only receives the variables it knows about; missing ones are skipped.
- Single click dispatches `dispatchBatch` with one group per (template × row).

## 3. Batch progress dashboard (new route `/batches`)

- Lists recent batches with live aggregate status (queued / running / completed / failed / cancelled), counts, started-at.
- Detail panel per batch:
  - Per-job progress rows (engine · row label · status · stage / %).
  - Realtime subscription on `jobs` filtered by the batch's job ids.
  - **Retry failed**, **Cancel queued/running**, **Download all (ZIP)** actions.
- ZIP uses client-side JSZip + fetch over each output URL — no server bundling work.

## Technical details

- No schema change. Batch metadata lives in `jobs.brief.batch_id` and `jobs.brief.batch_label` (jsonb is already there).
- New server fns in `src/lib/batch.functions.ts`:
  - `dispatchBatch` — accepts `{ batchLabel, groups: [{ templateId, engines, rows }] }`; reuses the existing per-row project/job/output creation loop; stamps every job with `batch_id` (uuid generated server-side) + `batch_label`.
  - `listBatches` — returns recent batches for the workspace (aggregated counts via a single `jobs` query, grouped client-side).
  - `getBatch({ batchId })` — full job list + outputs for a batch.
  - `retryBatchFailed({ batchId })` — flips failed jobs back to `queued` and clears `brief.progress`.
  - `cancelBatch({ batchId })` — sets queued/running jobs to `cancelled`.
- Realtime: dashboard subscribes to `postgres_changes` on `jobs` filtered by `id=in.(...)` (same pattern already used in `CreateVariationsTab`).
- Reuses existing `dispatchVariations` field validation rules; both fns share `SUPPORTED_ENGINES` and `validateField`.
- Sidebar nav: add **Batches** link to the authenticated layout.

## Files

- **New**: `src/lib/batch.functions.ts`, `src/routes/_authenticated/batches.tsx`, `src/routes/_authenticated/templates.batch.tsx`, `src/components/BatchRowsTable.tsx`.
- **Edit**: `src/components/CreateVariationsTab.tsx` (add Batch tab + table), `src/routes/_authenticated/templates.index.tsx` (Batch dispatch button), sidebar/nav file if present.
- Install: `jszip`, `file-saver` for client-side ZIP.
