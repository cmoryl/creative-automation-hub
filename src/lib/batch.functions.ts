import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { dispatchBatchCore } from "./batch-core.server";


const SUPPORTED_ENGINES = ["illustrator", "indesign", "figma", "canva", "claude"] as const;

const rowSchema = z.object({
  label: z.string().min(1).max(200),
  values: z.record(z.string(), z.string()),
});

const groupSchema = z.object({
  templateId: z.string().uuid(),
  engines: z.array(z.enum(SUPPORTED_ENGINES)).min(1).max(5),
  rows: z.array(rowSchema).min(1).max(100),
});

// ---------- dispatchBatch ----------
export const dispatchBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        batchLabel: z.string().min(1).max(200),
        briefSummary: z.string().max(2000).optional(),
        groups: z.array(groupSchema).min(1).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    return dispatchBatchCore(context.supabase, context.userId, data);
  });


// ---------- listBatches ----------
export const listBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("jobs")
      .select("id, status, engine, row_label, brief, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;

    type Batch = {
      batchId: string;
      batchLabel: string;
      startedAt: string;
      total: number;
      counts: Record<string, number>;
      engines: Set<string>;
    };
    const byBatch = new Map<string, Batch>();
    for (const j of data ?? []) {
      const brief = (j.brief ?? {}) as { batch_id?: string; batch_label?: string };
      const bid = brief.batch_id;
      if (!bid) continue;
      let b = byBatch.get(bid);
      if (!b) {
        b = {
          batchId: bid,
          batchLabel: brief.batch_label ?? "Batch",
          startedAt: j.created_at,
          total: 0,
          counts: {},
          engines: new Set(),
        };
        byBatch.set(bid, b);
      }
      b.total++;
      b.counts[j.status] = (b.counts[j.status] ?? 0) + 1;
      b.engines.add(j.engine);
      if (new Date(j.created_at) < new Date(b.startedAt)) b.startedAt = j.created_at;
    }
    return Array.from(byBatch.values())
      .map((b) => ({ ...b, engines: Array.from(b.engines) }))
      .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))
      .slice(0, 50);
  });

// ---------- getBatch ----------
export const getBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ batchId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select(
        "id, status, engine, row_label, brief, error, project_id, template_id, created_at, completed_at",
      )
      .filter("brief->>batch_id", "eq", data.batchId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const jobIds = (jobs ?? []).map((j) => j.id);
    const { data: outs } = jobIds.length
      ? await supabase
          .from("outputs")
          .select("id, job_id, url, kind, metadata, created_at")
          .in("job_id", jobIds)
      : { data: [] as never[] };

    return { jobs: jobs ?? [], outputs: outs ?? [] };
  });

// ---------- retryBatchFailed ----------
export const retryBatchFailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ batchId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("id, status, engine, brief")
      .filter("brief->>batch_id", "eq", data.batchId)
      .in("status", ["failed"]);
    if (error) throw error;

    let updated = 0;
    for (const j of jobs ?? []) {
      const needsBridge = j.engine === "illustrator" || j.engine === "indesign";
      const brief = (j.brief ?? {}) as Record<string, unknown>;
      brief.progress = needsBridge
        ? { stage: "queued", percent: 0, message: "Retry queued" }
        : null;
      const { error: upErr } = await supabase
        .from("jobs")
        .update({
          status: needsBridge ? "queued" : "completed",
          error: null,
          brief: brief as never,
          completed_at: needsBridge ? null : new Date().toISOString(),
        })
        .eq("id", j.id);
      if (upErr) throw upErr;
      updated++;
    }
    return { updated };
  });

// ---------- cancelBatch ----------
export const cancelBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ batchId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("id, status")
      .filter("brief->>batch_id", "eq", data.batchId)
      .in("status", ["queued", "running"]);
    if (error) throw error;

    let cancelled = 0;
    for (const j of jobs ?? []) {
      const { error: upErr } = await supabase
        .from("jobs")
        .update({
          status: "cancelled",
          error: "Cancelled by user",
          completed_at: new Date().toISOString(),
        })
        .eq("id", j.id);
      if (upErr) throw upErr;
      cancelled++;
    }
    return { cancelled };
  });
