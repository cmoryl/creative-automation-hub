import { createFileRoute } from "@tanstack/react-router";
import { authenticateAgent, json } from "@/lib/agent-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Lists every bridge:// template the agent's workspace owns, so the agent
// can run a local inventory pass and POST results to
// /api/public/agent/templates/inventory.
export const Route = createFileRoute("/api/public/agent/templates")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = await authenticateAgent(request);
          const { data, error } = await supabaseAdmin
            .from("templates")
            .select("id, name, engine, source_ref, requirements")
            .eq("workspace_id", auth.workspaceId)
            .or("engine.eq.illustrator,engine.eq.indesign");
          if (error) return json({ error: error.message }, { status: 500 });
          const items = (data ?? []).filter(
            (t) => typeof t.source_ref === "string" && t.source_ref.startsWith("bridge://"),
          );
          return json({ templates: items });
        } catch (e) {
          if (e instanceof Response) return e;
          return json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
