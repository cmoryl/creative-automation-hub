# Local-Machine Reliability Pass

Goal: make every flow that touches the user's computer (Illustrator/InDesign templates, local fonts, linked assets, bridge agent install/pairing) work the first time on a fresh Mac or Windows machine, with clear, actionable errors when it doesn't.

## Scope

Three phases, shipped together:

### 1. Install + pairing (first 5 minutes on a new machine)

- **Install scripts** (`agent/install-macos.sh`, `agent/install-windows.ps1`): preflight Node.js version, check write permissions, fail with a one-line remedy instead of a stack trace, and print the exact next step (paste pairing token, run agent).
- **Pairing UX** (`src/routes/_authenticated/settings.agent.tsx`): show live "waiting for first heartbeat" state, surface the most common failures (wrong token, firewall, no internet) with named remedies, and confirm with a green check the moment `/api/public/agent/ping` succeeds.
- **Token endpoint hardening** (`src/lib/agent-auth.server.ts`): return distinguishable 401 reasons (`token_unknown` vs `token_revoked`) so the agent log says "token revoked — re-pair in Settings → Agent" instead of a bare 401.

### 2. Template / font / link readiness (before a job runs)

- **Agent inventory** (`agent/status.mjs`): already scans templates and fonts; extend to also resolve InDesign linked images (`Links` folder convention) and report `links_missing` properly instead of always-empty.
- **Server inventory ingest** (`src/routes/api/public/agent/templates.inventory.ts`): persist `file_present`, `fonts_missing`, `links_missing` per (template, agent) so we can show real per-machine readiness, not just the last-seen snapshot.
- **Preflight UI** (`src/components/PreflightPanel.tsx`, `src/components/TemplateAvailabilityDetail.tsx`): before a render is queued, block submit with a clear panel listing every missing file/font/link plus the machine it's missing on, and give one-click "copy install path" / "open template folder" actions where possible.
- **First-render wizard** (`src/components/FirstRenderWizard.tsx`): walk new users through "drop your .ai/.indd into the templates folder", verify via inventory roundtrip, then unlock the run button.

### 3. Job run + error surfacing (when something does go wrong)

- **Agent error classification** (`agent/agent.mjs` + `agent/status.mjs`): expand `parseExtendscriptErrors` to detect the top 8 ExtendScript failure modes (missing font, missing link, locked layer, color profile mismatch, PDF preset missing, file in use, permission denied, app crash) and tag each with `reason` + `transient` flag.
- **Retry policy** (`src/lib/retry-classifier.ts`): auto-retry transient classes once (file in use, app warming up); never auto-retry permanent ones (missing font/link).
- **User-facing error report** (`src/components/RenderErrorReport.tsx`): translate the classified reason into plain English with a remedy and a "what to send support" copy block. No raw ExtendScript stacks unless the user clicks "Show technical details".
- **End-to-end smoke** (`tests/smoke-agent-endpoints.mjs` + new `tests/smoke-local-reliability.mjs`): cover install-token verify → heartbeat → inventory → claim → complete (success and each classified failure), runnable from `.github/workflows/smoke-agent.yml`.

## Out of scope

- New engines (Runway, Flux, etc.) — explicitly held per earlier instruction.
- Cloud engines (Canva, Express, Figma) — already handled separately; only touched if they share the preflight/error UI.
- Auto-installing Adobe apps or fonts — we detect and report, we don't install.

## Technical notes

- No schema migration required for phase 1 or 3. Phase 2 needs one small migration to add `agent_template_inventory (agent_id, template_id, file_present, fonts_missing[], links_missing[], checked_at)` so we can show per-machine status.
- All changes stay inside the existing `createServerFn` + `/api/public/agent/*` server-route boundary. No new external dependencies.
- ExtendScript runners (`agent/engines/illustrator/run.mjs`, `agent/engines/indesign/run.mjs`) get small additions to surface link/font errors in a structured `JSON_ERROR:` line the agent can parse, instead of relying on regex over freeform logs.

## Rollout order

1. Phase 2 migration + inventory wiring (foundation; everything else reads from it).
2. Phase 3 classification + error UI (immediate UX win on existing jobs).
3. Phase 1 install/pairing polish (last because it benefits from the new error surfaces).
