import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboardStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [agentsRes, jobsRes, recentJobsRes, outputsRes, templatesRes, integrationsRes] = await Promise.all([
      supabase.from("agent_pairings").select("id, name, last_seen, workspace_id, created_at"),
      supabase.from("jobs").select("id, engine, status, created_at, completed_at, error, brief, template_id, project_id"),
      supabase
        .from("jobs")
        .select("id, engine, status, created_at, completed_at, error, brief, template_id, project_id")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase.from("outputs").select("id, created_at, kind"),
      supabase.from("templates").select("id, engine, source_ref, name"),
      supabase.from("workspace_integrations").select("provider, updated_at"),
    ]);

    const jobs = jobsRes.data ?? [];
    const agents = agentsRes.data ?? [];
    const templates = templatesRes.data ?? [];

    const now = Date.now();
    const isLive = (ts: string | null) => !!ts && now - new Date(ts).getTime() < 5 * 60 * 1000;

    const engines = ["illustrator", "indesign", "figma", "canva", "claude"] as const;
    const engineStats = engines.map((engine) => {
      const engineJobs = jobs.filter((j) => j.engine === engine);
      const completed = engineJobs.filter((j) => j.status === "completed").length;
      const failed = engineJobs.filter((j) => j.status === "failed").length;
      const running = engineJobs.filter((j) => j.status === "running").length;
      const queued = engineJobs.filter((j) => j.status === "queued").length;
      const total = engineJobs.length;
      const successRate = total > 0 ? (completed / total) * 100 : null;

      const needsBridge = engine === "illustrator" || engine === "indesign";
      const hasLiveAgent = needsBridge
        ? agents.some((a) => isLive(a.last_seen))
        : true;

      const status: "healthy" | "degraded" | "down" | "idle" =
        total === 0
          ? "idle"
          : needsBridge && !hasLiveAgent && queued > 0
            ? "down"
            : failed > 0 && successRate !== null && successRate < 75
              ? "degraded"
              : "healthy";

      return {
        engine,
        needsBridge,
        hasLiveAgent,
        total,
        completed,
        failed,
        running,
        queued,
        successRate,
        templateCount: templates.filter((t) => t.engine === engine).length,
        status,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        lastSeen: a.last_seen,
        online: isLive(a.last_seen),
      })),
      totals: {
        jobs: jobs.length,
        completed: jobs.filter((j) => j.status === "completed").length,
        running: jobs.filter((j) => j.status === "running").length,
        queued: jobs.filter((j) => j.status === "queued").length,
        failed: jobs.filter((j) => j.status === "failed").length,
        outputs: outputsRes.data?.length ?? 0,
        templates: templates.length,
      },
      engines: engineStats,
      integrations: (integrationsRes.data ?? []).map((i) => ({
        provider: i.provider,
        updatedAt: i.updated_at,
      })),
      recentJobs: recentJobsRes.data ?? [],
    };
  });
