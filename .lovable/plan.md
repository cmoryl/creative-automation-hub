# Advanced Canva Integration

Build a real Canva engine on top of the existing OAuth connection so users can browse Canva designs, autofill brand templates, export, upload assets, and react to webhooks — driven both from a single job and from a bulk CSV run.

## What you'll see in the app

1. **Settings → Integrations → Canva**
   - After connecting: "Connected as {user}" + token expiry, plus buttons:
     - Sync brand templates
     - Sync designs
     - Test export
   - New "Webhook URL" field with copy button (paste into Canva developer console).

2. **Templates page**
   - New "Import from Canva" action that pulls Brand Templates and Designs into the `templates` table (engine = `canva`) with thumbnails and detected variable fields.
   - Each Canva template shows its source (Brand Template vs. Design) and editable variable mappings.

3. **Project / Job page**
   - When a Canva template is selected, the variables form is generated from the Brand Template's dataset fields (text + image).
   - "Generate" runs: autofill → poll → export → store PNG/PDF/MP4 in `job-outputs` → write rows into `outputs`.
   - Progress states: `queued → autofilling → exporting → completed | failed`, surfaced live via Supabase Realtime on `jobs`.

4. **Templates → Batch**
   - New "Run with Canva" mode for the existing batch CSV uploader: one row = one autofill+export. Creates one job per row tied to the same `batch_approvals` entry.

5. **Library**
   - "Push to Canva" on any `product_assets` row uploads it to the workspace's Canva asset library and stores the returned `asset_id` in `metadata.canva_asset_id` for reuse in autofill.

## Technical plan

### Token + client helpers (`src/lib/canva.server.ts`)
- `getCanvaClient(workspaceId)` — loads `workspace_integrations` row, auto-refreshes the access token via `POST /rest/v1/oauth/token` with `grant_type=refresh_token` when `expires_at` is within 60s, persists the new tokens.
- `canvaFetch(workspaceId, path, init)` — wraps `fetch` against `https://api.canva.com/rest/v1`, attaches bearer, retries once on 401 by forcing refresh.
- All Canva HTTP calls go through this helper.

### Server functions (`src/lib/canva.functions.ts`)
- `listCanvaBrandTemplates({ continuation? })` — `GET /brand-templates`.
- `listCanvaDesigns({ query?, continuation? })` — `GET /designs`.
- `importCanvaTemplate({ kind: 'brand_template'|'design', id })` — fetches dataset (`GET /brand-templates/{id}/dataset` for brand templates) and inserts/updates a row in `templates` with `engine='canva'`, `source_ref='canva://{kind}/{id}'`, `variables` derived from dataset field types (`text` → text, `image` → image, etc.), `preview_url` from thumbnail.
- `runCanvaJob({ jobId })` — server-side orchestrator:
  1. Loads job + template, reads `variables`.
  2. Maps variables → Canva `data` object (text → `{type:'text', text}`; image → `{type:'image', asset_id}` — resolves `asset_id` from `product_assets.metadata.canva_asset_id`, uploading first if missing).
  3. `POST /autofills` → returns `job` id, polls `GET /autofills/{id}` until `success`/`failed`.
  4. `POST /exports` with selected format (PNG default, PDF if template has >1 page, MP4 for video designs), polls until ready.
  5. For each exported URL: downloads, uploads to Supabase `job-outputs` bucket at `canva/{jobId}/{n}.{ext}`, inserts into `outputs`.
  6. Updates `jobs.status` (`completed`/`failed`) and `completed_at`.
- `uploadProductAssetToCanva({ assetId })` — streams the asset bytes to `POST /asset-uploads` (multipart), stores returned `asset_id` on `product_assets.metadata.canva_asset_id`.
- `runCanvaBatch({ batchKey, rows })` — fans out one job per row, links them all to a single `batch_approvals` row.

### Webhook receiver (`src/routes/api/public/webhooks/canva.ts`)
- Verifies `X-Canva-Signature` (HMAC SHA-256 over body with the workspace's stored webhook secret), rejects on mismatch.
- Handles event types:
  - `design.updated` — invalidate cached thumbnail/dataset on matching `templates` row.
  - `export.completed` — finalize matching job (look up by stored `canva_export_id` in `jobs.brief.canva`).
- Inserts an `audit_events` row per delivery.

### Schema migration
- Add `metadata jsonb default '{}'` to `outputs` if not already permissive enough (it already is — no change).
- Add `canva` jsonb column? No — reuse `jobs.brief.canva = { autofill_id, export_id, format }`.
- Add a unique index on `templates (workspace_id, source_ref)` so re-imports upsert cleanly.
- Add `webhook_secret text` slot inside `workspace_integrations.metadata` (no schema change; generated when user opens the webhook panel).

### UI wiring
- `templates.index.tsx` — add "Import from Canva" dialog (lists brand templates + designs in tabs, multi-select → import).
- `settings.integrations.tsx` — after connection, render sync buttons + webhook URL/secret panel.
- `projects.$projectId.tsx` — when template engine is `canva`, render dataset-driven form and call `runCanvaJob` instead of the mock engine.
- `templates.batch.tsx` — add Canva mode in the engine picker.
- `library.tsx` — "Push to Canva" row action.

## Out of scope (call out, don't build)
- Editing designs in-place via embed — Canva's embed/SDK requires a Canva App, separate flow.
- Per-end-user Canva OAuth (this stays workspace-scoped, as today).
- Realtime collaborative comments sync.

## Files touched
- new: `src/lib/canva.server.ts`, `src/routes/api/public/webhooks/canva.ts`, `src/components/canva/ImportDialog.tsx`, `src/components/canva/CanvaJobRunner.tsx`
- edited: `src/lib/canva.functions.ts`, `src/routes/_authenticated/settings.integrations.tsx`, `src/routes/_authenticated/templates.index.tsx`, `src/routes/_authenticated/templates.batch.tsx`, `src/routes/_authenticated/projects.$projectId.tsx`, `src/routes/_authenticated/library.tsx`
- migration: unique index on `templates (workspace_id, source_ref)`
