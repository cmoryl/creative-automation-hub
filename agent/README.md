# Local Bridge Agent

A tiny headless Node service that connects your local Illustrator + InDesign
engines to the hosted Creative Automation Platform — no Electron required.

## Setup

1. In the web app, go to **Settings → Local Agent → Create token** and copy the
   pairing token (shown once).
2. Run the agent on the machine that has Illustrator/InDesign installed:

   ```bash
   LOVABLE_AGENT_TOKEN=<paste-token> \
   LOVABLE_API_BASE=https://your-app.lovable.app \
   node agent.mjs
   ```

3. The web app's **Local Agent** page should show the agent as online within
   a few seconds.

## Wiring your existing engines

`agent.mjs` ships with stub `runIllustrator` / `runInDesign` functions. Replace
them with calls into your existing `engines/illustrator/` and
`engines/indesign/` packages. Each adapter receives the queued job:

```js
{
  id, project_id, engine, template_id,
  brief: {...},       // free-form structured brief from Claude
  variables: {...},   // template variable assignments
}
```

…and must return an array of outputs:

```js
[
  { kind: "pdf",  url: "https://...", metadata: { pages: 4 } },
  { kind: "png",  url: "https://...", metadata: { width: 1080, height: 1080 } },
]
```

Outputs are surfaced in the **Outputs** page and attached to the job.

## Protocol

The agent talks to three public endpoints (no auth required at the platform
level — the bearer token IS the auth):

| Method | Path                          | Purpose                          |
|--------|-------------------------------|----------------------------------|
| GET    | `/api/public/agent/ping`      | heartbeat + identity             |
| POST   | `/api/public/agent/claim`     | claim next queued AI/ID job      |
| POST   | `/api/public/agent/complete`  | report success/failure + outputs |

All requests must include `Authorization: Bearer <token>`.
