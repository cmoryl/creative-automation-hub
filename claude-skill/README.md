# Creative Automation — Claude Skill

A thin skill that lets Claude Desktop / Claude Code orchestrate jobs against
your hosted Creative Automation Platform.

## Setup

1. In the web app, go to **Settings → API Tokens** and create a token. Copy
   the `cap_…` value (shown once).
2. Set environment variables for the skill:
   - `CAP_BASE_URL` — e.g. `https://your-project.lovable.app`
   - `CAP_TOKEN` — the `cap_…` token

## Tools exposed to Claude

- `create_job(projectId, engine, templateId?, brief, variables)` →
  `POST {base}/api/public/v1/jobs`
- `get_job(jobId)` →
  `GET {base}/api/public/v1/jobs/{jobId}` (returns job + outputs)
- `list_jobs(projectId?)` →
  `GET {base}/api/public/v1/jobs?projectId=…`

`engine` is one of: `illustrator | indesign | figma | canva | hybrid | mock`.

Illustrator and InDesign jobs are picked up by the **local bridge agent**
(see `/agent`). Figma and Canva run server-side. `hybrid` fans out per
engine.

## Example

```bash
curl -X POST $CAP_BASE_URL/api/public/v1/jobs \
  -H "Authorization: Bearer $CAP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "00000000-0000-0000-0000-000000000000",
    "engine": "figma",
    "templateId": "11111111-1111-1111-1111-111111111111",
    "brief": { "headline": "Spring sale" },
    "variables": { "locale": "en-US" }
  }'
```

Poll the returned `job.id` against `GET /api/public/v1/jobs/{jobId}` until
`status` is `succeeded` or `failed`; `outputs[]` contains the resulting
URLs.
