// Shared batch dispatch core, callable from a user-scoped server fn or from
// the admin-scoped scheduled-runner route.
import { generateClaudeCopy } from "./claude.functions";
import { fireflyGenerateImages, ExpressNotConfiguredError } from "./express.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function interpolateExpress(s: string, vars: Record<string, string>) {
  return s.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}


export type BatchDispatchInput = {
  batchLabel: string;
  briefSummary?: string;
  groups: {
    templateId: string;
    engines: string[];
    rows: { label: string; values: Record<string, string> }[];
  }[];
};

export async function dispatchBatchCore(
  supabase: any,
  userId: string,
  data: BatchDispatchInput,
) {
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
        const isExpress = engine === "express";
        const willMock = !needsBridge && !isClaude && !isExpress;

        const { data: job, error: jobErr } = await supabase
          .from("jobs")
          .insert({
            project_id: proj.id,
            workspace_id: tpl.workspace_id,
            template_id: tpl.id,
            engine,
            row_label: row.label,
            status: willMock || isClaude ? "completed" : isExpress ? "queued" : "queued",
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
            },
            variables: row.values,
            completed_at:
              willMock || isClaude ? new Date().toISOString() : null,
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
            },
          });
        }

        if (isClaude) {
          try {
            const result = await generateClaudeCopy({
              data: {
                templateName: tpl.name,
                variables: Array.isArray(tpl.variables)
                  ? (tpl.variables as { name: string; label?: string; type?: string }[])
                  : [],
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
              },
            });
          } catch (e: any) {
            await supabase
              .from("jobs")
              .update({
                status: "failed",
                error: e.message ?? "Claude generation failed",
              })
              .eq("id", job.id);
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

  if (created.length > 0) {
    const firstProj = created[0];
    const { data: proj } = await supabase
      .from("projects")
      .select("workspace_id")
      .eq("id", firstProj.projectId)
      .single();
    if (proj?.workspace_id) {
      await supabase.from("audit_events").insert({
        workspace_id: proj.workspace_id,
        actor_id: userId,
        action: "batch.dispatched",
        target_type: "batch",
        target_id: batchId,
        summary: `Dispatched batch "${data.batchLabel}" — ${totalJobs} job(s)`,
        metadata: { batchId, totalJobs, groups: data.groups.length },
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
}
