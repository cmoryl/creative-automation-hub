import { createFileRoute } from "@tanstack/react-router";
import { authenticateApi, jsonResponse } from "@/lib/api-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/v1/jobs/$jobId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticateApi(request);
          const { data: job, error } = await supabaseAdmin
            .from("jobs")
            .select(
              "id, project_id, engine, status, error, brief, variables, created_at, claimed_at, completed_at",
            )
            .eq("id", params.jobId)
            .eq("workspace_id", auth.workspaceId)
            .maybeSingle();
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
          if (!job) return jsonResponse({ error: "not found" }, { status: 404 });

          const { data: outputs } = await supabaseAdmin
            .from("outputs")
            .select("id, kind, url, metadata, created_at")
            .eq("job_id", job.id);

          return jsonResponse({ job, outputs: outputs ?? [] });
        } catch (e) {
          if (e instanceof Response) return e;
          return jsonResponse({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
