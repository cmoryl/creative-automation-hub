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
    const outRes = await supabase
      .from("outputs")
      .select("id, kind, url, metadata, job_id, created_at")
      .in("job_id", (jobRes.data ?? []).map((j) => j.id))
      .order("created_at", { ascending: false });
    return {
      template: tplRes.data,
      jobs: jobRes.data ?? [],
      outputs: outRes.data ?? [],
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
      .select("id, engine, workspace_id")
      .eq("id", data.templateId)
      .single();
    if (tplErr) throw tplErr;

    let projectId = data.projectId;
    if (!projectId) {
      const { data: proj, error: projErr } = await supabase
        .from("projects")
        .insert({
          workspace_id: tpl.workspace_id,
          name: `Bridge run ${new Date().toLocaleString()}`,
          status: "active",
          created_by: userId,
          brief: data.briefSummary ?? "Dispatched from template deep-dive view.",
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
        status: "queued",
        brief: { summary: data.briefSummary ?? "" },
        variables: data.variables,
      })
      .select("id")
      .single();
    if (jobErr) throw jobErr;
    return { jobId: job.id, projectId };
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

