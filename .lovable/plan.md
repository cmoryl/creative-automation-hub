# Creative Automation Platform — Web Rebuild

Move off Electron. Build a hosted web app on Lovable Cloud that runs a Claude-orchestrated workflow end-to-end: brief → template pick → variant generation → live files + output bundle. Canva and Figma are driven from the cloud. Illustrator and InDesign are driven through a small headless local bridge agent that users install once.

## Architecture

```text
 Browser (TanStack Start UI)
        |
        v
 Lovable Cloud (Postgres + Auth + Storage)
   - projects, templates, jobs, outputs, assets
   - RLS scoped to user/workspace
        |
        +--> Server functions (createServerFn)
        |     - Claude orchestration (AI SDK + Lovable AI Gateway)
        |     - Canva Connect API (OAuth, Autofill, Export)
        |     - Figma REST (templates, components, variables, duplicate)
        |     - Job runner, render queue, output bundler
        |
        +--> Local Bridge Agent  (http://127.0.0.1:47821, paired by token)
              - Headless Node service the user installs once
              - Wraps the existing engines/illustrator + engines/indesign
              - Polls /api/public/agent/jobs for AI/ID jobs, posts results back
```

No Electron shell, no desktop window. The bridge agent is a tiny background service (menubar/tray optional) ported from `engines/illustrator` and `engines/indesign` in the current repo.

## Phase 1 — Foundation (this build)

Goal: working web app, auth, data model, Claude chat that can draft a brief and pick a template, Canva + Figma read-only template registry, mocked render path so the full flow is clickable. No local agent yet.

1. Enable Lovable Cloud and set up auth (email/password + Google).
2. Data model (Postgres + RLS):
   - `profiles` (id → auth.users)
   - `workspaces`, `workspace_members`, `user_roles` (separate roles table)
   - `projects` (campaign-level)
   - `templates` (engine: canva|figma|illustrator|indesign, source_ref, variables JSON, preview_url)
   - `jobs` (project_id, template_id, status, brief, variables JSON, claude_thread_id)
   - `outputs` (job_id, kind: live_file|pdf|png|bundle, url, metadata)
   - `agent_pairings` (workspace_id, name, token_hash, last_seen)
3. App shell + routes:
   - `/` marketing/landing
   - `/login`
   - `/_authenticated/projects` list + detail
   - `/_authenticated/projects/$id` brief + Claude chat + template picker + job runs + outputs
   - `/_authenticated/templates` registry browser (Canva + Figma sources)
   - `/_authenticated/outputs` Output Center
   - `/_authenticated/settings/agent` pair/manage local bridge
4. Claude orchestration:
   - `/api/chat` server route streaming through Lovable AI Gateway
   - Tools: `search_templates`, `propose_variables`, `create_job`, `request_render`, `summarize_outputs`
   - Persist threads per project; render tool calls inline in the chat
5. Canva integration: OAuth, list brand templates, autofill → returns live editable design URL + PNG/PDF export.
6. Figma integration: PAT or OAuth, list team files/components, read variables, duplicate file for a new version.
7. Mocked AI/ID path: jobs targeting Illustrator/InDesign enqueue and show a clear "Awaiting local agent" state.

## Phase 2 — Local Bridge Agent (next iteration)

- Strip Electron shell from `apps/desktop`. Repackage `engines/illustrator` + `engines/indesign` + `packages/core` as a headless Node service.
- Pairing flow: user generates a token in `/settings/agent`, installs the agent, agent calls `/api/public/agent/pair` with the token, gets a long-lived agent token.
- Job loop: agent polls `/api/public/agent/jobs/next`, executes via existing safe runner, uploads outputs back via signed Cloud Storage URLs, posts status.
- All `/api/public/agent/*` routes verify the agent token and are scoped to that workspace.

## Phase 3 — Claude Skill + Hybrid

- Publish the existing `claude-skill` as a thin skill that calls the platform's public job API (so Claude Desktop / Claude Code can run jobs against the same backend).
- Hybrid engine: combine Figma source-of-truth + Canva autofill + AI/ID press-ready PDFs in one job spec.

## What carries over from your repo

- `claude-skill/job_schema.example.json` → canonical job shape in `jobs.brief` / `jobs.variables`.
- `packages/template-registry` → schema model for the `templates` table.
- `packages/output-center` → schema model for the `outputs` table + Output Center UI.
- `engines/illustrator` and `engines/indesign` → become the bridge agent in Phase 2.
- `engines/canva`, `engines/adobe_express`, `engines/hybrid` → become server-function modules in Phase 1/3.

## What this plan explicitly will NOT do

- Will not build, package, or sign a DMG.
- Will not drive Illustrator/InDesign from the browser. They require the local bridge agent (Phase 2).
- Will not migrate npm workspaces wholesale — the web app is a fresh TanStack Start build that references the v3 schemas, not a port of the Electron renderer.

## Technical notes

- Stack: TanStack Start (already scaffolded here), React 19, Tailwind v4, shadcn, Lovable Cloud (Postgres + Auth + Storage + RLS), AI SDK with Lovable AI Gateway (`google/gemini-3-flash-preview` default).
- Secrets needed in Phase 1: Canva client ID/secret, Figma PAT or OAuth client. `LOVABLE_API_KEY` is auto-provisioned.
- Roles in a separate `user_roles` table with a `has_role()` security-definer function (never on profiles).
- All agent endpoints live under `/api/public/agent/*` with token verification; never return user PII.

## Deliverable for the first build

Phase 1 only. Phase 2 (local bridge) and Phase 3 (Claude skill + hybrid) are follow-up builds.
