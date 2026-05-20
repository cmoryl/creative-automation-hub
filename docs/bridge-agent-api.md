# Local Bridge Agent — API Specification (v0.1)

The **bridge agent** is a small daemon that runs on a designer's machine
alongside Adobe Illustrator / InDesign. It polls the cloud for queued
render jobs targeting `engine = illustrator | indesign`, drives the
desktop app via ExtendScript / UXP, and uploads the resulting artefacts.

```text
┌──────────────┐   1. claim    ┌────────────────┐
│ Cloud (TSS)  │ ◀──────────── │ Local Bridge   │
│  jobs table  │   2. status   │  (Node daemon) │
│  outputs     │ ◀──────────── │  + Illustrator │
└──────────────┘   3. upload   └────────────────┘
        ▲                              │
        └────────── 4. complete ◀──────┘
```

All HTTP endpoints live under `/api/public/bridge/*` (public prefix —
auth happens at handler level, see below).

---

## 1. Pairing & auth

### One-time pairing (UI → DB)

The workspace owner clicks **"Pair new agent"** in Settings → Agents.
The UI calls a `createServerFn` that:

1. generates a 32-byte random token `tok_live_xxx…`,
2. stores `sha256(token)` + workspace_id + agent name in `agent_pairings`,
3. returns the **raw token once** for the user to paste into the desktop app.

The token is never stored or sent again.

### Per-request auth

The agent sends:

```
Authorization: Bearer tok_live_xxx
X-Agent-Id:     <uuid>          # the agent_pairings.id
```

Every endpoint:

```ts
const token = req.headers.get("authorization")?.replace("Bearer ", "");
const row = await supabaseAdmin
  .from("agent_pairings")
  .select("id, workspace_id, token_hash")
  .eq("id", req.headers.get("x-agent-id"))
  .single();

if (!row || !timingSafeEqual(sha256(token), row.token_hash)) {
  return new Response("Unauthorized", { status: 401 });
}

// touch last_seen so the dispatcher sees the agent as live (≤5 min window)
await supabaseAdmin
  .from("agent_pairings")
  .update({ last_seen: new Date().toISOString() })
  .eq("id", row.id);
```

A workspace is "live" for a given engine whenever
`agent_pairings.last_seen > now() - 5 min`. The existing
`dispatchVariations` server fn already uses this signal.

---

## 2. Endpoints

### `POST /api/public/bridge/heartbeat`

Keep-alive ping. Call every 30s.

**Request**
```json
{ "engines": ["illustrator", "indesign"], "version": "0.3.1" }
```

**Response** `200`
```json
{ "ok": true, "queued_jobs": 4 }
```

---

### `POST /api/public/bridge/jobs/claim`

Atomically claim the next queued job for this agent's workspace +
declared engines. Uses `UPDATE … WHERE status='queued' RETURNING *` so
two agents never get the same job.

**Request**
```json
{ "engines": ["illustrator"], "max": 1 }
```

**Response** `200`
```json
{
  "jobs": [
    {
      "id": "9a1c…",
      "engine": "illustrator",
      "template": {
        "id": "c035…",
        "name": "[Live] Life Sciences Case Study – A4",
        "source_ref": "bridge://templates/CASE_STUDY_LETTER_MASTER_v001.ai",
        "variables": [/* schema */]
      },
      "row_label": "Acme Bio – Q3 study",
      "variables": {
        "client_name": "Acme Bio",
        "case_study_title": "Reducing assay variance by 38%",
        "hero_image": "https://…signed-url…",
        "primary_color": "#0066CC"
      },
      "brief": { "summary": "…", "row": "Acme Bio – Q3 study" },
      "assets": [
        { "field": "hero_image", "url": "https://…signed…", "mime": "image/png" },
        { "field": "logo",       "url": "https://…signed…", "mime": "image/svg+xml" }
      ],
      "claim_token": "ct_…",     // opaque, required for subsequent calls
      "expires_at": "2026-05-20T18:45:00Z"
    }
  ]
}
```

Side effect: sets `jobs.status='in_progress'`, `claimed_at=now()`,
`assigned_agent_id=<agent_id>`.

If the agent dies, an unfinished job auto-expires back to `queued`
after `expires_at` (cron sweep — see §5).

---

### `POST /api/public/bridge/jobs/:id/progress`

Optional progress pings so the UI activity log shows real work.

**Request**
```json
{
  "claim_token": "ct_…",
  "stage": "rendering",          // opening | rendering | exporting | uploading
  "percent": 45,
  "message": "Page 1 of 2"
}
```

Persisted on `jobs.brief.progress` (jsonb merge) and broadcast via
Supabase Realtime on the `jobs` table — the existing
`CreateVariationsTab` activity log subscribes and renders these.

---

### `POST /api/public/bridge/jobs/:id/outputs`

Request a signed PUT URL for one artefact, then upload directly to
`brief-uploads` (or a new `job-outputs` bucket — recommended).

**Request**
```json
{
  "claim_token": "ct_…",
  "kind": "pdf",                 // pdf | png | jpg | ai | indd | psd
  "filename": "acme-bio-q3.pdf",
  "size_bytes": 2418112,
  "metadata": { "pages": 2, "color_space": "CMYK", "dpi": 300 }
}
```

**Response** `200`
```json
{
  "upload": {
    "method": "PUT",
    "url": "https://…supabase…/object/upload/signed/job-outputs/…",
    "headers": { "x-upsert": "true" },
    "expires_in": 300
  },
  "output_id": "o_…"
}
```

The agent PUTs the file, then calls **complete** below to commit. The
server inserts the `outputs` row only on commit (so failed uploads
don't leave orphan rows).

---

### `POST /api/public/bridge/jobs/:id/complete`

**Request**
```json
{
  "claim_token": "ct_…",
  "outputs": [
    { "output_id": "o_…", "storage_path": "job-outputs/ws/…/acme.pdf" },
    { "output_id": "o_…", "storage_path": "job-outputs/ws/…/acme.png" }
  ],
  "duration_ms": 8420
}
```

Server:
1. validates each `storage_path` exists in storage,
2. inserts `outputs` rows (`kind`, `url`, `metadata`),
3. sets `jobs.status='completed'`, `completed_at=now()`,
4. returns `{ ok: true }`.

---

### `POST /api/public/bridge/jobs/:id/fail`

**Request**
```json
{
  "claim_token": "ct_…",
  "error": "ExtendScript: cannot find layer 'hero_image'",
  "retryable": false,
  "logs": "…tail of agent log…"
}
```

Sets `jobs.status='failed'`, `jobs.error=<error>`. If `retryable=true`
and `attempts < 3` (tracked in `jobs.brief.attempts`), the server flips
it back to `queued` for another agent to pick up.

---

## 3. Template source resolution

Template `source_ref` is a URI the agent knows how to fetch:

| Scheme                         | Meaning                                         |
| ------------------------------ | ----------------------------------------------- |
| `bridge://templates/foo.ai`    | File in the agent's configured templates folder |
| `https://…`                    | Download from URL (signed if private)           |
| `gdrive://<file-id>`           | Future — pull from a workspace's Drive          |

Agents ship with a `~/Lovable Bridge/Templates/` folder; the desktop
UI lets a designer drop master files there and register them.

---

## 4. Variable → layer mapping

The agent uses a deterministic naming convention so designers don't need
to write code:

| Variable type | Illustrator target              | InDesign target               |
| ------------- | ------------------------------- | ----------------------------- |
| `text`        | Text frame named `{{name}}`     | Text frame named `{{name}}`   |
| `image`       | Linked image named `{{name}}`   | Image frame named `{{name}}`  |
| `color`       | Swatch named `{{name}}`         | Swatch named `{{name}}`       |
| `list`        | Group named `{{name}}` (repeat) | Table or repeating frame      |

The `templates.variables` JSON already carries `name` + optional `layer`
override, so agents can map cleanly.

---

## 5. Server-side housekeeping (cron)

A `pg_cron` (or scheduled TSS route at `/api/public/cron/bridge-sweep`)
runs every minute:

```sql
-- Reclaim stuck jobs
UPDATE jobs
SET status='queued', claimed_at=NULL, assigned_agent_id=NULL
WHERE status='in_progress'
  AND claimed_at < now() - interval '10 minutes';

-- Mark agents offline (informational only)
UPDATE agent_pairings SET … WHERE last_seen < now() - interval '5 minutes';
```

---

## 6. Minimum viable agent loop (pseudo-code)

```ts
while (true) {
  await POST("/heartbeat", { engines, version });
  const { jobs } = await POST("/jobs/claim", { engines, max: 1 });
  for (const job of jobs) {
    try {
      await POST(`/jobs/${job.id}/progress`, { stage: "opening", percent: 5 });
      const templatePath = await resolveTemplate(job.template.source_ref);
      const assets       = await downloadAssets(job.assets);
      await POST(`/jobs/${job.id}/progress`, { stage: "rendering", percent: 30 });
      const artefacts    = await runExtendScript(job.engine, templatePath, {
        ...job.variables, ...assets,
      });
      await POST(`/jobs/${job.id}/progress`, { stage: "uploading", percent: 85 });
      const uploaded     = await uploadAll(job.id, artefacts);
      await POST(`/jobs/${job.id}/complete`, { outputs: uploaded });
    } catch (err) {
      await POST(`/jobs/${job.id}/fail`, {
        error: String(err), retryable: isTransient(err),
      });
    }
  }
  await sleep(5_000);
}
```

---

## 7. Open questions (decide before building)

1. **Storage bucket** — reuse `brief-uploads` or create a dedicated
   `job-outputs` bucket with stricter RLS (read-by-workspace-members)?
2. **Token rotation** — auto-rotate per agent on N days, or only on
   manual revoke?
3. **Multi-agent fairness** — round-robin claim, or first-come?
4. **Asset egress** — sign asset URLs at claim time (simple, 15-min
   expiry) or pre-bundle into a zip the agent downloads once?
5. **Live preview** — should `progress` payloads carry a low-res
   thumbnail (base64) so the UI shows the render mid-flight?
