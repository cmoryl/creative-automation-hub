# Local Bridge Agent

Headless Node service that connects locally-installed Adobe Illustrator and
InDesign to the hosted Creative Automation Platform. No Electron, no
proprietary daemon — just `node agent.mjs`.

## Requirements

- macOS or Windows with **Adobe Illustrator** and/or **Adobe InDesign** installed
- Node.js 20+
- Network access to your Lovable Cloud app

## Setup

1. In the web app, go to **Settings → Local Agent → Create token** and copy
   the pairing token (shown only once).
2. Put your `.ai` / `.indd` template masters in a folder on the same machine.
   By default the agent looks in `./templates` relative to this folder; override
   with `LOVABLE_AGENT_TEMPLATES=/abs/path/to/templates`.
3. Run the agent:

   ```bash
   LOVABLE_AGENT_TOKEN=<paste-token> \
   LOVABLE_API_BASE=https://your-app.lovable.app \
   LOVABLE_AGENT_TEMPLATES=/Users/you/Lovable/templates \
   node agent.mjs
   ```

4. Within ~10s the **Local Agent** banner on the template page should turn
   green ("Online — listening for jobs").

## How a job runs

1. Web app queues a job with `engine: "illustrator"` (or `indesign`),
   `template_id`, `variables`, and `brief`.
2. Agent's poll loop calls `/agent/claim` and receives the job (with the
   resolved template `source_ref`).
3. Agent maps `bridge://templates/<filename>` → a real local file inside
   `LOVABLE_AGENT_TEMPLATES`, writes a temporary ExtendScript that opens the
   doc, replaces text frames / fill colours from `variables`, and exports
   PNG + PDF to a temp folder.
4. Adobe app is invoked:
   - macOS: `osascript -e 'tell application "Adobe Illustrator" to do javascript file …'`
   - Windows: PowerShell COM bridge (`Illustrator.Application.DoJavaScriptFile`)
5. Exported files are PUT to signed Cloud storage URLs (`/agent/upload-url`),
   then `/agent/complete` is called with `status: "succeeded"` and an
   `outputs[]` array.
6. Progress pings (`opening` → `rendering` → `uploading` → `done`) stream
   into the activity log on the web app via Postgres realtime.

## Variable mapping

The ExtendScript matches template variables against:

- **Text frames** — by the frame's `name` property (set "Name" in Illustrator
  Layers panel, or `label` in InDesign Script Label panel).
- **Path items** — by name, with `#RRGGBB` strings applied as fill colour.

For Illustrator template `CASE_STUDY_LETTER_MASTER_v001.ai`, name your
text frames `client_name`, `case_study_title`, `subtitle`, etc. — matching
the template variables defined in the database.

## Customising

`agent/engines/illustrator/run.mjs` and `agent/engines/indesign/run.mjs` are
intentionally small (~150 lines each). Fork them to add image placement,
multi-artboard exports, font activation, preflight, etc.

## Protocol

| Method | Path                          | Purpose                          |
|--------|-------------------------------|----------------------------------|
| GET    | `/api/public/agent/ping`      | identity                         |
| POST   | `/api/public/agent/heartbeat` | liveness + queued count          |
| POST   | `/api/public/agent/claim`     | claim next queued AI/ID job      |
| POST   | `/api/public/agent/progress`  | mid-render stage updates         |
| POST   | `/api/public/agent/upload-url`| signed PUT for an output file    |
| POST   | `/api/public/agent/complete`  | report success/failure + outputs |

All requests must include `Authorization: Bearer <token>`.
