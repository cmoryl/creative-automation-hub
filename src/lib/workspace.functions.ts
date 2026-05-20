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
