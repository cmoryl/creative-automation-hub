# Feature Buildout — Engines, Brands, Briefs, Batch

Bring the v3 CreativeOS dashboard surface into the web app: dashboard with
engine status, brands, brand batch, structured briefs, and a richer
template/engine model. Builds on the existing Cloud schema and integrations.

## Scope

### 1. Dashboard (`/dashboard`, becomes default authed landing)

```text
+----------------------------------------------------------+
| Creative Automation Platform     [Projects][Templates]...|
| 0 of 5 engines ready                                     |
+----------------------------------------------------------+
| Engine cards: Illustrator | InDesign | Canva | Express | Figma
|   each shows: connected? · template count · "Connect →"  |
+----------------------------------------------------------+
| Quick Actions          | Recent Projects                  |
|  - Brand Generate      |  list + "New Project"            |
|  - Brand Batch         |                                  |
|  - New Project         |                                  |
|  - Run Batch           |                                  |
|  - Browse Templates    |                                  |
|  - System Check        |                                  |
+----------------------------------------------------------+
| Setup progress bar (X of N steps complete)               |
+----------------------------------------------------------+
```

### 2. Brands (`/brands`, `/brands/$brandId`)

Brand kits scoped to workspace:
- name, slug, logo_url, palette (jsonb: array of hex), fonts (jsonb), tone, guidelines (markdown)
- attached to projects and brand-batch runs so renders inherit colours/type

### 3. Brand Batch (`/batch`)

CSV-driven bulk run: rows × engines → one job per (row, engine) sharing a
`batch_id`. Upload CSV, map columns → template variables, pick engines,
queue. Status page shows progress per row.

### 4. Engine pages (`/engines/$engine`)

One detail page per engine (illustrator, indesign, canva, adobe-express,
figma) showing: connection status, templates registered to this engine,
recent jobs, engine-specific actions (e.g. Figma → Import file URL,
Illustrator → Download bridge agent).

### 5. Structured briefs

Replace free-text `projects.brief` with a typed brief block on each project:
- headline, subhead, body, cta, channel (social/print/email/web), locale,
  audience, assets (logo override, hero image url), notes
- Claude chat reads/edits this brief via tool calls (already wired pattern)

### 6. Templates (extend)

Add `kind` (master/variant), `aspect_ratio`, `dimensions`, `brand_id?`,
`tags[]`. Template grid with filters by engine, brand, tag.

### 7. System Check

Diagnostic page that pings: Cloud DB, AI gateway, each integration
(Figma/Canva creds present, agent last_seen < 5m), surfacing red/amber/green.

## Data model changes

New tables:
- `brands` (workspace_id, name, slug, logo_url, palette, fonts, tone, guidelines)
- `batches` (workspace_id, project_id, name, status, total, succeeded, failed, csv_url)
- `batch_rows` (batch_id, row_index, variables jsonb, job_ids uuid[])

Column adds:
- `projects`: `brand_id uuid?`, `brief_struct jsonb default '{}'`
- `templates`: `kind text default 'master'`, `aspect_ratio text`, `dimensions jsonb`, `brand_id uuid?`, `tags text[] default '{}'`
- `jobs`: `batch_id uuid?`, `batch_row int?`

RLS: workspace-member scoped on all new tables (same pattern as existing).

## Routing additions

- `/_authenticated/dashboard` (new index for authed users)
- `/_authenticated/brands`, `/_authenticated/brands/$brandId`
- `/_authenticated/batch`, `/_authenticated/batch/$batchId`
- `/_authenticated/engines/$engine`
- `/_authenticated/system-check`

Sidebar reordered: Dashboard · Projects · Brands · Templates · Batch · Outputs · — · Engines (collapsible: Illustrator, InDesign, Canva, Adobe Express, Figma) · — · Integrations · Local Agent · API Tokens.

## Build order (incremental)

1. **Migration**: brands, batches, batch_rows + column adds.
2. **Dashboard** page with engine status cards, counts, quick actions, recent projects, setup progress.
3. **Brands** CRUD (list, create, edit, delete) + brand picker on project.
4. **Structured brief editor** on project page (alongside chat).
5. **Engine detail pages** (one component, route per engine).
6. **Brand Batch** (CSV upload, mapping, queue fan-out, status).
7. **System Check** page.
8. Template extensions (kind/dimensions/brand/tags) + grid filters.

Each step is independently shippable.

## Out of scope (for now)

- Adobe Express full integration (placeholder engine card only).
- Real Canva OAuth dance (credentials form already exists; the dance lands once you provide the app).
- Storage bucket for CSV uploads — uses signed URLs in step 6 only.

## Open question

Confirm before step 1: do you want me to keep the existing `/projects` as
the landing for authed users, or switch landing to the new `/dashboard`?
(Plan assumes Dashboard.)
