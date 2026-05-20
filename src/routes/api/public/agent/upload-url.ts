import { createFileRoute } from "@tanstack/react-router";
import { authenticateAgent, json } from "@/lib/agent-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const Body = z.object({
  jobId: z.string().uuid(),
  filename: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-zA-Z0-9._-]+$/, "filename must be alphanumeric + . _ -"),
});

// Agent asks for a signed PUT URL, uploads the artefact directly to
// storage, then calls /agent/complete with the resulting public URL.
export const Route = createFileRoute("/api/public/agent/upload-url")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await authenticateAgent(request);
          const parsed = Body.safeParse(await request.json());
          if (!parsed.success)
            return json({ error: "invalid body" }, { status: 400 });
          const { jobId, filename } = parsed.data;

          // Verify the job belongs to this workspace.
          const { data: job } = await supabaseAdmin
            .from("jobs")
            .select("id")
            .eq("id", jobId)
            .eq("workspace_id", auth.workspaceId)
            .maybeSingle();
          if (!job) return json({ error: "not found" }, { status: 404 });

          const path = `${auth.workspaceId}/${jobId}/${Date.now()}-${filename}`;
          const { data, error } = await supabaseAdmin.storage
            .from("job-outputs")
            .createSignedUploadUrl(path);
          if (error || !data)
            return json(
              { error: error?.message ?? "upload url failed" },
              { status: 500 },
            );

          const { data: pub } = supabaseAdmin.storage
            .from("job-outputs")
            .getPublicUrl(path);

          return json({
            path,
            token: data.token,
            signed_url: data.signedUrl,
            public_url: pub.publicUrl,
            expires_in: 300,
          });
        } catch (e) {
          if (e instanceof Response) return e;
          return json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
