import { createFileRoute } from "@tanstack/react-router";
import { authenticateAgent, json } from "@/lib/agent-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const Body = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["succeeded", "completed", "failed"]),
  error: z.string().max(4000).optional(),
  error_stage: z
    .enum(["open", "fonts", "links", "swap", "export", "upload", "other"])
    .optional(),
  error_detail: z
    .object({
      message: z.string().max(4000).optional(),
      stack: z.string().max(20000).optional(),
      extendscript_log: z.string().max(40000).optional(),
      missing_fonts: z.array(z.string().max(200)).max(200).optional(),
      font_substitutions: z
        .array(z.object({ requested: z.string().max(200), used: z.string().max(200) }))
        .max(200)
        .optional(),
      missing_links: z.array(z.string().max(400)).max(200).optional(),
      files: z
        .array(
          z.object({
            name: z.string().max(400),
            path: z.string().max(800).optional(),
            exists: z.boolean().optional(),
          }),
        )
        .max(100)
        .optional(),
      agent_version: z.string().max(40).optional(),
    })
    .optional(),
  outputs: z
    .array(
      z.object({
        kind: z.string().min(1).max(60),
        url: z.string().url().max(2000),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .max(200)
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
          const { jobId, status, error, error_stage, error_detail, outputs } = parsed.data;

          // Verify ownership and pull template page count for validation
          const { data: job } = await supabaseAdmin
            .from("jobs")
            .select("id, brief, template_id, templates:template_id ( pages, name )")
            .eq("id", jobId)
            .eq("workspace_id", auth.workspaceId)
            .maybeSingle();
          if (!job) return json({ error: "not found" }, { status: 404 });

          // Per-page output validation. We don't fail the job, but we record
          // a structured `warnings` array onto job.brief so the UI can flag
          // incomplete renders (e.g. agent uploaded 8 pages of a 12pp magazine).
          const warnings: string[] = [];
          const tpl = (job as { templates?: { pages?: unknown; name?: string } | null }).templates ?? null;
          const pages = (Array.isArray(tpl?.pages) ? tpl!.pages : []) as Array<{ name?: string }>;
          if (status !== "failed" && pages.length > 1) {
            const pageNums = new Set<number>();
            let hasMasterPdf = false;
            for (const o of outputs) {
              const meta = (o.metadata ?? {}) as {
                page?: number;
                page_index?: number;
                scope?: string;
                master?: boolean;
              };
              const pageNum =
                typeof meta.page === "number"
                  ? meta.page
                  : typeof meta.page_index === "number"
                    ? meta.page_index
                    : null;
              if (pageNum) pageNums.add(pageNum);
              if (
                (meta.master === true ||
                  meta.scope === "master" ||
                  /master/i.test(o.kind)) &&
                /pdf/i.test(o.kind)
              ) {
                hasMasterPdf = true;
              }
            }
            for (let i = 1; i <= pages.length; i++) {
              if (!pageNums.has(i)) {
                warnings.push(
                  `Missing per-page output for page ${i}${pages[i - 1]?.name ? ` (${pages[i - 1].name})` : ""}`,
                );
              }
            }
            if (!hasMasterPdf) warnings.push("Missing master PDF (combined spread)");
          }

          const briefNext = {
            ...((job.brief as Record<string, unknown> | null) ?? {}),
            warnings: warnings.length ? warnings : undefined,
          };

          await supabaseAdmin
            .from("jobs")
            .update({
              status: status === "succeeded" ? "completed" : status,
              error: error ?? null,
              error_stage: error_stage ?? null,
              error_detail: (error_detail ?? null) as never,
              brief: briefNext as never,
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
          return json({ ok: true, warnings });
        } catch (e) {
          if (e instanceof Response) return e;
          return json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
