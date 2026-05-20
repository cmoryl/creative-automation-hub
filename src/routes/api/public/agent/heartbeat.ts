import { createFileRoute } from "@tanstack/react-router";
import { authenticateAgent, json } from "@/lib/agent-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const Body = z.object({
  engines: z
    .array(z.enum(["illustrator", "indesign", "figma", "canva"]))
    .min(1)
    .max(4),
  version: z.string().max(40).optional(),
});

// Keep-alive ping. Agent calls every ~30s. Returns queue depth so the
// daemon can decide whether to claim immediately or back off.
export const Route = createFileRoute("/api/public/agent/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await authenticateAgent(request);
          const parsed = Body.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success)
            return json({ error: "invalid body" }, { status: 400 });

          const { count } = await supabaseAdmin
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", auth.workspaceId)
            .in("engine", parsed.data.engines)
            .eq("status", "queued");

          return json({
            ok: true,
            agent: auth.name,
            queued_jobs: count ?? 0,
            server_time: new Date().toISOString(),
          });
        } catch (e) {
          if (e instanceof Response) return e;
          return json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
