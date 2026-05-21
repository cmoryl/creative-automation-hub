import { createFileRoute } from "@tanstack/react-router";
import { authenticateAgent, json } from "@/lib/agent-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyFailure, computeBackoffMs } from "@/lib/retry-classifier";
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
            .select("id, brief, template_id, retry_count, max_retries, templates:template_id ( pages, name )")
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

          // Smart retry: if this is a failure, classify it. Transient failures
          // get requeued (status='queued', next_retry_at in the future) until
          // retry_count exceeds max_retries; everything else stays failed.
          let nextStatus: string = status === "succeeded" ? "completed" : status;
          let retryCountNext: number | undefined;
          let nextRetryAt: string | null = null;
          let transient: boolean | null = null;
          let retryReason: string | null = null;

          if (status === "failed") {
            const cls = classifyFailure(error ?? null, error_stage ?? null, error_detail ?? null);
            transient = cls.transient;
            retryReason = cls.reason;
            const used = (job as { retry_count?: number }).retry_count ?? 0;
            const max = (job as { max_retries?: number }).max_retries ?? 1;
            if (cls.transient && used < max) {
              nextStatus = "queued";
              retryCountNext = used + 1;
              const backoff = computeBackoffMs(cls.backoff_ms, used);
              nextRetryAt = new Date(Date.now() + backoff).toISOString();
            }
          }

          const briefForRetry = {
            ...briefNext,
            last_retry_reason: retryReason ?? undefined,
          };

          await supabaseAdmin
            .from("jobs")
            .update({
              status: nextStatus,
              error: error ?? null,
              error_stage: error_stage ?? null,
              error_detail: (error_detail ?? null) as never,
              brief: briefForRetry as never,
              transient,
              ...(retryCountNext !== undefined ? { retry_count: retryCountNext } : {}),
              next_retry_at: nextRetryAt,
              // Only stamp completed_at when we're truly done.
              completed_at: nextStatus === "queued" ? null : new Date().toISOString(),
              // Free the agent slot so any agent can pick up the retry.
              ...(nextStatus === "queued"
                ? { assigned_agent_id: null, claimed_at: null }
                : {}),
            })
            .eq("id", jobId);

          if (outputs.length > 0 && nextStatus !== "queued") {
            await supabaseAdmin.from("outputs").insert(
              outputs.map((o) => ({
                job_id: jobId,
                kind: o.kind,
                url: o.url,
                metadata: (o.metadata ?? {}) as never,
              })),
            );
          }
          return json({
            ok: true,
            warnings,
            requeued: nextStatus === "queued",
            retry_reason: retryReason,
            next_retry_at: nextRetryAt,
          });
        } catch (e) {
          if (e instanceof Response) return e;
          return json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
