import { createFileRoute } from "@tanstack/react-router";
import { authenticateAgent, json } from "@/lib/agent-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const Body = z.object({
  jobId: z.string().uuid(),
  stage: z.enum(["opening", "rendering", "exporting", "uploading"]),
  percent: z.number().min(0).max(100),
  message: z.string().max(500).optional(),
});

// Optional mid-render status pings. Merged into jobs.brief.progress
// so the UI activity log (subscribed via Realtime) can show live work.
export const Route = createFileRoute("/api/public/agent/progress")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await authenticateAgent(request);
          const parsed = Body.safeParse(await request.json());
          if (!parsed.success)
            return json({ error: "invalid body" }, { status: 400 });
          const { jobId, stage, percent, message } = parsed.data;

          const { data: job } = await supabaseAdmin
            .from("jobs")
            .select("id, brief")
            .eq("id", jobId)
            .eq("workspace_id", auth.workspaceId)
            .maybeSingle();
          if (!job) return json({ error: "not found" }, { status: 404 });

          const brief =
            (job.brief && typeof job.brief === "object"
              ? (job.brief as Record<string, unknown>)
              : {}) ?? {};
          const nextBrief = {
            ...brief,
            progress: {
              stage,
              percent,
              message: message ?? null,
              at: new Date().toISOString(),
            },
          };

          const { error } = await supabaseAdmin
            .from("jobs")
            .update({ brief: nextBrief as never })
            .eq("id", jobId);
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
