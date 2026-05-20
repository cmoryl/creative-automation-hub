import { createFileRoute } from "@tanstack/react-router";
import { authenticateAgent, json } from "@/lib/agent-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Agent polls for the next queued job for its workspace.
export const Route = createFileRoute("/api/public/agent/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await authenticateAgent(request);
          // Claim oldest queued job for AI/ID engines in this workspace.
          const { data: job } = await supabaseAdmin
            .from("jobs")
            .select("id, project_id, engine, template_id, brief, variables, templates:template_id (id, name, engine, source_ref, variables)")
            .eq("workspace_id", auth.workspaceId)
            .in("engine", ["illustrator", "indesign"])
            .eq("status", "queued")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (!job) return json({ job: null });
          // Flatten the joined template under `template` for the agent.
          const { templates, ...rest } = job as typeof job & { templates: unknown };
          const flatJob = { ...rest, template: templates };

          const { error } = await supabaseAdmin
            .from("jobs")
            .update({
              status: "running",
              assigned_agent_id: auth.agentId,
              claimed_at: new Date().toISOString(),
            })
            .eq("id", job.id)
            .eq("status", "queued");
          if (error) return json({ job: null });
          return json({ job: flatJob });
        } catch (e) {
          if (e instanceof Response) return e;
          return json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
