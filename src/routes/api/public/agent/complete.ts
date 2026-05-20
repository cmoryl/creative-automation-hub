import { createFileRoute } from "@tanstack/react-router";
import { authenticateAgent, json } from "@/lib/agent-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const Body = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["succeeded", "completed", "failed"]),
  error: z.string().max(2000).optional(),
  outputs: z
    .array(
      z.object({
        kind: z.string().min(1).max(60),
        url: z.string().url().max(2000),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .max(50)
    .default([]),
});

export const Route = createFileRoute("/api/public/agent/complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await authenticateAgent(request);
          const parsed = Body.safeParse(await request.json());
          if (!parsed.success) return json({ error: "invalid body" }, { status: 400 });
          const { jobId, status, error, outputs } = parsed.data;

          // Make sure the job belongs to this agent's workspace
          const { data: job } = await supabaseAdmin
            .from("jobs")
            .select("id")
            .eq("id", jobId)
            .eq("workspace_id", auth.workspaceId)
            .maybeSingle();
          if (!job) return json({ error: "not found" }, { status: 404 });

          await supabaseAdmin
            .from("jobs")
            .update({
              status: status === "succeeded" ? "completed" : status,
              error: error ?? null,
              completed_at: new Date().toISOString(),
            })
            .eq("id", jobId);

          if (outputs.length > 0) {
            await supabaseAdmin.from("outputs").insert(
              outputs.map((o) => ({
                job_id: jobId,
                kind: o.kind,
                url: o.url,
                metadata: (o.metadata ?? {}) as never,
              })),
            );
          }
          return json({ ok: true });
        } catch (e) {
          if (e instanceof Response) return e;
          return json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
