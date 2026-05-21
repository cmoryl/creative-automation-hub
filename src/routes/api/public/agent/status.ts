import { createFileRoute } from "@tanstack/react-router";
import { authenticateAgent, json } from "@/lib/agent-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const Body = z.object({
  host: z.string().max(200).optional(),
  platform: z.string().max(120).optional(),
  agent_version: z.string().max(40).optional(),
  apps: z.record(z.unknown()).default({}),
  fonts_count: z.number().int().min(0).max(100000).default(0),
  fonts_sample: z.array(z.string().max(200)).max(200).default([]),
  disk_free_mb: z.number().int().min(0).optional(),
  current_job_id: z.string().uuid().nullable().optional(),
  templates_seen: z.number().int().min(0).max(10000).default(0),
});

// Agent posts a richer snapshot every ~5 min and at startup.
// Heartbeat stays lightweight; this is the "what does this machine look like"
// payload used by /settings/agent and the preflight system.
export const Route = createFileRoute("/api/public/agent/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await authenticateAgent(request);
          const parsed = Body.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success)
            return json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
          const p = parsed.data;

          const { error } = await supabaseAdmin
            .from("agent_status")
            .upsert(
              {
                agent_id: auth.agentId,
                workspace_id: auth.workspaceId,
                host: p.host ?? null,
                platform: p.platform ?? null,
                agent_version: p.agent_version ?? null,
                apps: p.apps as never,
                fonts_count: p.fonts_count,
                fonts_sample: p.fonts_sample as never,
                disk_free_mb: p.disk_free_mb ?? null,
                current_job_id: p.current_job_id ?? null,
                templates_seen: p.templates_seen,
                reported_at: new Date().toISOString(),
              },
              { onConflict: "agent_id" },
            );
          if (error) return json({ error: error.message }, { status: 500 });
          return json({ ok: true });
        } catch (e) {
          if (e instanceof Response) return e;
          return json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
