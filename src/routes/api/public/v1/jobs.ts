import { createFileRoute } from "@tanstack/react-router";
import { authenticateApi, jsonResponse } from "@/lib/api-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const CreateJob = z.object({
  projectId: z.string().uuid(),
  engine: z.enum(["illustrator", "indesign", "figma", "canva", "hybrid", "mock"]),
  templateId: z.string().uuid().optional(),
  brief: z.record(z.unknown()).default({}),
  variables: z.record(z.unknown()).default({}),
});

// Public job API for the Claude skill, Claude Code, and external CI.
// Auth: Authorization: Bearer cap_xxx  (workspace API token)
export const Route = createFileRoute("/api/public/v1/jobs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = await authenticateApi(request);
          const url = new URL(request.url);
          const projectId = url.searchParams.get("projectId");
          let q = supabaseAdmin
            .from("jobs")
            .select("id, project_id, engine, status, error, created_at, completed_at")
            .eq("workspace_id", auth.workspaceId)
            .order("created_at", { ascending: false })
            .limit(100);
          if (projectId) q = q.eq("project_id", projectId);
          const { data, error } = await q;
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
          return jsonResponse({ jobs: data ?? [] });
        } catch (e) {
          if (e instanceof Response) return e;
          return jsonResponse({ error: String(e) }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const auth = await authenticateApi(request);
          const parsed = CreateJob.safeParse(await request.json());
          if (!parsed.success)
            return jsonResponse({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
          const { projectId, engine, templateId, brief, variables } = parsed.data;

          // Verify project belongs to this workspace
          const { data: project } = await supabaseAdmin
            .from("projects")
            .select("id")
            .eq("id", projectId)
            .eq("workspace_id", auth.workspaceId)
            .maybeSingle();
          if (!project) return jsonResponse({ error: "project not found" }, { status: 404 });

          const { data: job, error } = await supabaseAdmin
            .from("jobs")
            .insert({
              project_id: projectId,
              workspace_id: auth.workspaceId,
              engine,
              template_id: templateId ?? null,
              brief: brief as never,
              variables: variables as never,
              status: "queued",
            })
            .select("id, engine, status, created_at")
            .single();
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
          return jsonResponse({ job }, { status: 201 });
        } catch (e) {
          if (e instanceof Response) return e;
          return jsonResponse({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
