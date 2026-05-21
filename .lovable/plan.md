# Production Sprint — Render Reliability

Goal: make missing templates, offline agents, missing fonts, missing assets, and ExtendScript errors visible **before** a job is queued and **immediately after** it runs. No redesign, no removed functionality, AI/copy generation untouched.

---

## 1. Bridge Agent Status Monitor

**What you'll see:** `/settings/agent` gains a live status card per paired agent — online/offline, host info, app versions (Illustrator/InDesign), font count, last-seen timing, disk free, current job. Offline agents are flagged red across the app (badge on Jobs and Preflight).

**Schema (new table):**
```
agent_status
  agent_id (uuid, PK → agent_pairings.id, cascade)
  workspace_id
  host (text)              -- "Studio Mac (Carla)"
  platform (text)          -- "darwin 24.0"
  agent_version (text)
  apps (jsonb)             -- {illustrator:{installed:true,version:"2024"}, indesign:{...}}
  fonts_count (int)
  fonts_sample (jsonb)     -- first 50 font family names
  disk_free_mb (int)
  current_job_id (uuid, nullable)
  templates_seen (int)     -- how many local .ai/.indd files matched
  reported_at (timestamptz)
```
RLS: workspace members read; only the service role writes (agent endpoint).

**New endpoint:** `POST /api/public/agent/status` — agent posts the snapshot every 5 min and on startup. Heartbeat is unchanged (kept lightweight).

**UI:** `src/components/AgentStatusCard.tsx` rendered in `settings.agent.tsx`. A small `AgentBadge` for headers in `jobs.tsx` and Preflight that shows "0/1 agents online for Illustrator".

---

## 2. Template Library Manager

**What you'll see:** Templates list (`/templates`) gains an Availability column: green if all online agents have the file + required fonts locally, amber if one is missing, red if no agent has it. A new `/templates/$templateId` "Library" tab lists required fonts, linked assets, and which agent currently has what.

**Schema additions:**
```
templates  +  requirements (jsonb default '{}')
              -- {fonts:[{family,style}], links:[{name,sha}], notes:""}

template_agent_availability  (new)
  template_id, agent_id  (composite PK)
  workspace_id
  file_present (bool)
  fonts_missing (jsonb)       -- ["Helvetica Neue Bold", …]
  links_missing (jsonb)
  checked_at (timestamptz)
```
RLS: workspace members read; service role writes from agent inventory.

**New endpoint:** `POST /api/public/agent/templates/inventory` — agent walks its local templates folder + queries OS for fonts and reports per-template availability.

**Server fn:** `setTemplateRequirements({templateId, requirements})` — used when creating/editing templates. (We can pre-fill from the agent's first inventory.)

---

## 3. Preflight QA System

**What you'll see:** A "Run preflight" button on each project + automatic preflight when submitting a job. Returns a checklist: template registered, all variables present, online agent for engine, agent has template file, required fonts installed, linked assets resolved, brand assets present. Errors block submission, warnings are dismissible.

**No schema change** — Preflight is read-only joins across `agent_pairings`, `agent_status`, `templates`, `template_agent_availability`, `jobs`.

**Server fn:** `runPreflight({ projectId, templateId?, variables? })` returns:
```ts
{
  ok: boolean,
  blocking: PreflightIssue[],
  warnings: PreflightIssue[],
  checks: { id, label, status:'pass'|'warn'|'fail', detail? }[]
}
```

**UI:** `src/components/PreflightPanel.tsx` rendered in `projects.$projectId.tsx` and wired into the "Submit job" buttons everywhere a job is created (`FirstRenderWizard`, `templates.batch.tsx`, project page). Submission is blocked on `blocking.length > 0`; warnings show a confirm dialog.

---

## 4. Detailed Render Error Reporting

**What you'll see:** Failed jobs in `/jobs` and the job drawer get a "Render report" panel that shows the stage that failed (open / preflight / swap-variables / export / upload), the ExtendScript log, missing fonts list, font substitutions applied, missing linked images, and a one-click "copy diagnostics" for support.

**Schema additions:** extend `/api/public/agent/complete` to accept a structured `error_detail` object, stored on `jobs` via two new columns:
```
jobs  +  error_stage (text)         -- 'open' | 'fonts' | 'links' | 'swap' | 'export' | 'upload' | 'other'
       +  error_detail (jsonb)      -- full structured report (see below)
```
`error_detail` shape:
```ts
{
  message: string,
  stack?: string,
  extendscript_log?: string,
  missing_fonts?: string[],
  font_substitutions?: { requested:string, used:string }[],
  missing_links?: string[],
  files?: { name, path, exists }[],
  agent_version?: string
}
```
Backwards compatible: existing `jobs.error` text is kept; `error_detail` is additive.

**UI:** `src/components/RenderErrorReport.tsx` used in `jobs.tsx` (already has a failed-job display) and from the job row drawer.

---

## Files changed / added

**New routes (API):**
- `src/routes/api/public/agent/status.ts`
- `src/routes/api/public/agent/templates.inventory.ts`

**New server-fn libs:**
- `src/lib/preflight.functions.ts`
- `src/lib/agent-status.functions.ts` (read-side for UI)
- `src/lib/template-requirements.functions.ts`

**New components:**
- `src/components/AgentStatusCard.tsx`
- `src/components/AgentBadge.tsx`
- `src/components/PreflightPanel.tsx`
- `src/components/RenderErrorReport.tsx`
- `src/components/TemplateAvailability.tsx`

**Edited (additive only):**
- `src/routes/api/public/agent/complete.ts` — accept `error_stage` + `error_detail`
- `src/routes/_authenticated/settings.agent.tsx` — render agent status cards
- `src/routes/_authenticated/templates.index.tsx` — availability column
- `src/routes/_authenticated/templates.$templateId.tsx` — Library tab
- `src/routes/_authenticated/projects.$projectId.tsx` — Preflight panel
- `src/routes/_authenticated/jobs.tsx` — Render error report
- `src/components/FirstRenderWizard.tsx`, `BatchRowsTable.tsx`, `templates.batch.tsx` — preflight gate before submit

**Migrations:** 1 migration covering all four features (new tables + new columns on `jobs` and `templates`), with workspace-scoped RLS.

---

## Local bridge-agent changes (manual, on your Mac)

These match the new endpoints; the deployed app keeps working without them, but Preflight and Status only light up once the agent is updated. I'll give you a drop-in diff after the server side is merged.

1. On startup and every 5 min, POST to `/api/public/agent/status` with `{host, platform, agent_version, apps, fonts_count, fonts_sample, disk_free_mb, templates_seen}`.
2. On startup and after each template add, POST `/api/public/agent/templates/inventory` with per-template `{template_id, file_present, fonts_missing, links_missing}`.
3. On failure in `/complete`, send `{error_stage, error_detail}` alongside `error`. Wrap the ExtendScript runner to capture `app.fonts`, missing-link list, and the full ExtendScript console log.

---

## Testing checklist

- [ ] Migration applies; RLS prevents cross-workspace reads on `agent_status` and `template_agent_availability`.
- [ ] `POST /api/public/agent/status` with a valid token writes a row; without a token → 401.
- [ ] `POST /api/public/agent/templates/inventory` upserts per (template, agent).
- [ ] `/settings/agent` shows the right online/offline badge, host, version, font count.
- [ ] `runPreflight` returns blocking error when no agent is online for the engine.
- [ ] `runPreflight` returns warning for missing fonts on one agent if another agent has them.
- [ ] Submit job button disabled when `blocking.length > 0` (in wizard, batch, project page).
- [ ] `/complete` with structured `error_detail` stores it; old agents sending only `error` still work.
- [ ] `/jobs` renders the Render Error Report when `error_detail` is present, falls back to plain `error` otherwise.
- [ ] AI/copy generation (`generateClaudeCopy`, brief-agent, batch) unchanged.
- [ ] Existing Canva/Figma flows unchanged.
