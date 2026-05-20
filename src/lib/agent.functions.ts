import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export const createAgentPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ name: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();
    if (!ws) throw new Error("No workspace");
    const token = randomBytes(24).toString("base64url");
    const { data: row, error } = await supabase
      .from("agent_pairings")
      .insert({
        workspace_id: ws.id,
        name: data.name,
        token_hash: sha256(token),
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id, token, workspaceId: ws.id };
  });

export const deleteAgentPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agent_pairings")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const createJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projectId: z.string().uuid(),
      engine: z.enum(["illustrator", "indesign", "figma", "canva", "mock"]),
      templateId: z.string().uuid().optional(),
      brief: z.record(z.unknown()).default({}),
      variables: z.record(z.unknown()).default({}),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: job, error } = await supabase
      .from("jobs")
      .insert({
        project_id: data.projectId,
        engine: data.engine,
        template_id: data.templateId ?? null,
        brief: data.brief as never,
        variables: data.variables as never,
        status: "queued",
      })
      .select("id, engine, status")
      .single();
    if (error) throw error;
    return job;
  });

export const listProjectJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: jobs, error } = await context.supabase
      .from("jobs")
      .select("id, engine, status, error, created_at, completed_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return jobs ?? [];
  });
