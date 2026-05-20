import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMyWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  });

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, brief, status, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ name: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();
    if (wsErr) throw wsErr;
    if (!ws) throw new Error("No workspace found");
    const { data: project, error } = await supabase
      .from("projects")
      .insert({ workspace_id: ws.id, name: data.name, created_by: userId })
      .select("id")
      .single();
    if (error) throw error;
    return project;
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: project, error } = await supabase
      .from("projects")
      .select("id, name, brief, status, workspace_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    return project;
  });

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("templates")
      .select("id, name, engine, preview_url, source_ref")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const renameTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), name: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("templates")
      .update({ name: data.name })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("templates").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const duplicateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: src, error: e1 } = await context.supabase
      .from("templates")
      .select("workspace_id, name, engine, source_ref, preview_url, variables")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw e1;
    if (!src) throw new Error("Template not found");
    const { data: row, error } = await context.supabase
      .from("templates")
      .insert({
        workspace_id: src.workspace_id,
        name: `${src.name} (copy)`,
        engine: src.engine,
        source_ref: src.source_ref,
        preview_url: src.preview_url,
        variables: src.variables as never,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const updateTemplateVariables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      variables: z.array(
        z.object({
          name: z.string().min(1).max(80),
          label: z.string().max(120).optional(),
          type: z.enum(["text", "image", "color", "list"]),
          layer: z.string().max(120).optional(),
        }),
      ),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("templates")
      .update({ variables: data.variables as never })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteOutput = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("outputs").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });


export const getTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [tplRes, jobRes] = await Promise.all([
      supabase
        .from("templates")
        .select("id, name, engine, preview_url, source_ref, variables, created_at, workspace_id")
        .eq("id", data.id)
        .maybeSingle(),
      supabase
        .from("jobs")
        .select("id, status, engine, variables, created_at, completed_at, project_id, error")
        .eq("template_id", data.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (tplRes.error) throw tplRes.error;
    if (jobRes.error) throw jobRes.error;
    if (!tplRes.data) return null;
    const bridgeRequired = tplRes.data.source_ref?.startsWith("bridge://") ?? false;
    const agentRes = bridgeRequired
      ? await supabase
          .from("agent_pairings")
          .select("id, name, last_seen")
          .eq("workspace_id", tplRes.data.workspace_id)
          .order("last_seen", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };
    if (agentRes.error) throw agentRes.error;
    const outRes = await supabase
      .from("outputs")
      .select("id, kind, url, metadata, job_id, created_at")
      .in("job_id", (jobRes.data ?? []).map((j) => j.id))
      .order("created_at", { ascending: false });
    const lastSeen = agentRes.data?.last_seen ?? null;
    const isLiveAgent =
      !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
    const jobs = jobRes.data ?? [];
    return {
      template: tplRes.data,
      jobs,
      outputs: outRes.data ?? [],
      bridge: {
        required: bridgeRequired,
        agentName: agentRes.data?.name ?? null,
        lastSeen,
        isLiveAgent,
        queuedJobs: jobs.filter((job) => job.status === "queued").length,
        runningJobs: jobs.filter((job) => job.status === "running").length,
      },
    };
  });

export const dispatchTemplateJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        templateId: z.string().uuid(),
        projectId: z.string().uuid().optional(),
        variables: z.record(z.string(), z.unknown()).default({}),
        briefSummary: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: tpl, error: tplErr } = await supabase
      .from("templates")
      .select("id, name, engine, workspace_id, preview_url, source_ref")
      .eq("id", data.templateId)
      .single();
    if (tplErr) throw tplErr;

    // Check if a bridge agent is paired (active within last 5 min)
    const { data: agents } = await supabase
      .from("agent_pairings")
      .select("id, last_seen")
      .eq("workspace_id", tpl.workspace_id)
      .order("last_seen", { ascending: false })
      .limit(1);
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const hasLiveAgent = !!agents?.[0]?.last_seen && new Date(agents[0].last_seen).getTime() > fiveMinAgo;
    const needsBridge = tpl.source_ref?.startsWith("bridge://") ?? false;
    const shouldQueueForBridge = needsBridge;
    const willMock = !shouldQueueForBridge;

    let projectId = data.projectId;
    if (!projectId) {
      const variationName =
        (data.variables?.case_study_title as string) ||
        (data.variables?.headline as string) ||
        (data.variables?.title as string) ||
        `Variation ${new Date().toLocaleString()}`;
      const { data: proj, error: projErr } = await supabase
        .from("projects")
        .insert({
          workspace_id: tpl.workspace_id,
          name: `${tpl.name} — ${variationName}`,
          status: "active",
          created_by: userId,
          brief: data.briefSummary ?? `Variation of ${tpl.name}`,
        })
        .select("id")
        .single();
      if (projErr) throw projErr;
      projectId = proj.id;
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        project_id: projectId,
        workspace_id: tpl.workspace_id,
        template_id: tpl.id,
        engine: tpl.engine,
        status: shouldQueueForBridge ? "queued" : "completed",
        brief: {
          summary: data.briefSummary ?? "",
          progress: shouldQueueForBridge
            ? {
                stage: hasLiveAgent ? "queued" : "awaiting_agent",
                percent: 0,
                message: hasLiveAgent
                  ? "Waiting for the local bridge agent to claim this job."
                  : "No live bridge agent detected. Start the local agent to render this template.",
              }
            : null,
        },
        variables: data.variables as never,
        completed_at: willMock ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (jobErr) throw jobErr;

    if (willMock && tpl.preview_url) {
      await supabase.from("outputs").insert({
        job_id: job.id,
        kind: "png",
        url: tpl.preview_url,
        metadata: { mock: true, variables: data.variables } as never,
      });
    }

    return {
      jobId: job.id,
      projectId,
      mocked: willMock,
      hasLiveAgent,
      waitingForAgent: shouldQueueForBridge,
    };
  });

export const listOutputs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("outputs")
      .select("id, kind, url, metadata, created_at, job_id")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const listAgentPairings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("agent_pairings")
      .select("id, name, last_seen, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("jobs")
      .select("id, engine, status, created_at, completed_at, project_id, template_id, variables")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const getShowcase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [tplRes, jobRes, outRes, projRes] = await Promise.all([
      supabase
        .from("templates")
        .select("id, name, engine, preview_url, source_ref, variables")
        .like("name", "[Example]%")
        .order("engine"),
      supabase
        .from("jobs")
        .select("id, engine, status, variables, template_id, project_id, completed_at")
        .order("completed_at", { ascending: false })
        .limit(50),
      supabase
        .from("outputs")
        .select("id, kind, url, metadata, job_id")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("projects")
        .select("id, name, brief, status")
        .like("name", "[Example]%")
        .limit(5),
    ]);
    if (tplRes.error) throw tplRes.error;
    if (jobRes.error) throw jobRes.error;
    if (outRes.error) throw outRes.error;
    if (projRes.error) throw projRes.error;
    return {
      templates: tplRes.data ?? [],
      jobs: jobRes.data ?? [],
      outputs: outRes.data ?? [],
      projects: projRes.data ?? [],
    };
  });

