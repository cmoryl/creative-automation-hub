import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

export const Route = createFileRoute("/api/public/share/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = (params as { slug: string }).slug;
        if (!slug || !/^[A-Za-z0-9_-]{8,64}$/.test(slug)) {
          return json({ error: "invalid slug" }, { status: 400 });
        }
        const { data: link, error } = await supabaseAdmin
          .from("share_links")
          .select("id, kind, output_id, batch_key, expires_at, revoked_at")
          .eq("slug", slug)
          .maybeSingle();
        if (error || !link) return json({ error: "not found" }, { status: 404 });
        if (link.revoked_at) return json({ error: "revoked" }, { status: 410 });
        if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
          return json({ error: "expired" }, { status: 410 });
        }

        await supabaseAdmin
          .from("share_links")
          .update({ view_count: (await currentViews(link.id)) + 1 })
          .eq("id", link.id);

        if (link.kind === "output" && link.output_id) {
          const { data: out } = await supabaseAdmin
            .from("outputs")
            .select("id, url, kind, metadata, created_at, jobs:job_id ( engine, row_label, template_id, templates:template_id ( name ) )")
            .eq("id", link.output_id)
            .maybeSingle();
          if (!out) return json({ error: "output gone" }, { status: 404 });
          return json({ kind: "output", output: out });
        }

        if (link.kind === "batch" && link.batch_key) {
          const { data: jobs } = await supabaseAdmin
            .from("jobs")
            .select("id, engine, status, row_label, brief, completed_at")
            .filter("brief->>batch_id", "eq", link.batch_key)
            .order("created_at", { ascending: true });
          const jobIds = (jobs ?? []).map((j) => j.id);
          const { data: outs } = jobIds.length
            ? await supabaseAdmin
                .from("outputs")
                .select("id, job_id, url, kind, metadata")
                .in("job_id", jobIds)
            : { data: [] as never[] };
          return json({ kind: "batch", jobs: jobs ?? [], outputs: outs ?? [] });
        }

        return json({ error: "malformed link" }, { status: 500 });
      },
    },
  },
});

async function currentViews(id: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("share_links")
    .select("view_count")
    .eq("id", id)
    .maybeSingle();
  return data?.view_count ?? 0;
}
