import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateClaudeCopy } from "./claude.functions";

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
    const { supabase, userId } = context;
    const batchId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    const created: {
      projectId: string;
      jobIds: string[];
      label: string;
      templateId: string;
    }[] = [];
    let totalJobs = 0;
    let liveAgentSeen = false;

    for (const group of data.groups) {
      const { data: tpl, error: tplErr } = await supabase
        .from("templates")
        .select("id, name, workspace_id, preview_url, variables")
        .eq("id", group.templateId)
        .single();
      if (tplErr) throw tplErr;

      const { data: agents } = await supabase
        .from("agent_pairings")
        .select("last_seen")
        .eq("workspace_id", tpl.workspace_id)
        .order("last_seen", { ascending: false })
        .limit(1);
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      const hasLiveAgent =
        !!agents?.[0]?.last_seen &&
        new Date(agents[0].last_seen).getTime() > fiveMinAgo;
      if (hasLiveAgent) liveAgentSeen = true;

      for (const row of group.rows) {
        const { data: proj, error: projErr } = await supabase
          .from("projects")
          .insert({
            workspace_id: tpl.workspace_id,
            name: `${tpl.name} — ${row.label}`,
            status: "active",
            created_by: userId,
            brief: data.briefSummary ?? `Batch ${data.batchLabel}: ${row.label}`,
          })
          .select("id")
          .single();
        if (projErr) throw projErr;

        const jobIds: string[] = [];
        for (const engine of group.engines) {
          const needsBridge = engine === "illustrator" || engine === "indesign";
          const isClaude = engine === "claude";
          const willMock = !needsBridge && !isClaude;

          const { data: job, error: jobErr } = await supabase
            .from("jobs")
            .insert({
              project_id: proj.id,
              workspace_id: tpl.workspace_id,
              template_id: tpl.id,
              engine,
              row_label: row.label,
              status: willMock || isClaude ? "completed" : "queued",
              brief: {
                summary: data.briefSummary ?? "",
                row: row.label,
                batch_id: batchId,
                batch_label: data.batchLabel,
                template_name: tpl.name,
                progress: needsBridge
                  ? {
                      stage: hasLiveAgent ? "queued" : "awaiting_agent",
                      percent: 0,
                      message: hasLiveAgent
                        ? "Waiting for the local bridge agent to claim this job."
                        : "No live bridge agent detected. Start the local agent to render this job.",
                    }
                  : null,
              } as never,
              variables: row.values as never,
              completed_at: willMock || isClaude ? new Date().toISOString() : null,
            })
            .select("id")
            .single();
          if (jobErr) throw jobErr;
          jobIds.push(job.id);
          totalJobs++;

          if (willMock && tpl.preview_url) {
            await supabase.from("outputs").insert({
              job_id: job.id,
              kind: "png",
              url: tpl.preview_url,
              metadata: {
                mock: true,
                engine,
                row_label: row.label,
                batch_id: batchId,
                variables: row.values,
              } as never,
            });
          }

          if (isClaude) {
            try {
              const result = await generateClaudeCopy({
                data: {
                  templateName: tpl.name,
                  variables: Array.isArray(tpl.variables) ? tpl.variables as { name: string; label?: string; type?: string }[] : [],
                  brief: data.briefSummary ?? "",
                  rowLabel: row.label,
                },
              });
              await supabase.from("outputs").insert({
                job_id: job.id,
                kind: "text",
                url: "",
                metadata: {
                  engine: "claude",
                  row_label: row.label,
                  batch_id: batchId,
                  variables: row.values,
                  generated: result.copy,
                  raw: result.raw,
                  fallback: result.usedFallback,
                } as never,
              });
            } catch (e: any) {
              await supabase.from("jobs").update({
                status: "failed",
                error: e.message ?? "Claude generation failed",
              }).eq("id", job.id);
            }
          }
        }
        created.push({
          projectId: proj.id,
          jobIds,
          label: row.label,
          templateId: tpl.id,
        });
      }
    }

    return {
      batchId,
      batchLabel: data.batchLabel,
      startedAt,
      hasLiveAgent: liveAgentSeen,
      totalJobs,
      created,
    };
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
