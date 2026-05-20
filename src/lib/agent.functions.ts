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
      engine: z.enum(["illustrator", "indesign", "figma", "canva", "hybrid", "mock"]),
      templateId: z.string().uuid().optional(),
      brief: z.record(z.unknown()).default({}),
      variables: z.record(z.unknown()).default({}),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const isMock = data.engine === "mock";
    const { data: job, error } = await supabase
      .from("jobs")
      .insert({
        project_id: data.projectId,
        engine: data.engine,
        template_id: data.templateId ?? null,
        brief: data.brief as never,
        variables: data.variables as never,
        status: isMock ? "completed" : "queued",
        completed_at: isMock ? new Date().toISOString() : null,
      })
      .select("id, engine, status")
      .single();
    if (error) throw error;

    if (isMock) {
      const seed = (job.id as string).slice(0, 8);
      await supabase.from("outputs").insert([
        {
          job_id: job.id,
          kind: "png",
          url: `https://picsum.photos/seed/${seed}-preview/1080/1080`,
          metadata: { source: "mock", role: "preview" } as never,
        },
        {
          job_id: job.id,
          kind: "pdf",
          url: `https://picsum.photos/seed/${seed}-master/1240/1754`,
          metadata: { source: "mock", role: "master" } as never,
        },
      ]);
    }
    return job;
  });

export const listProjectJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: jobs, error } = await context.supabase
      .from("jobs")
      .select("id, engine, status, error, created_at, completed_at, outputs(id, kind, url, metadata)")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return jobs ?? [];
  });

// Preflight a render request before queuing.
// - illustrator/indesign/hybrid: needs a paired agent with a recent heartbeat.
// - figma/canva: needs a workspace integration token.
// - mock: always ok.
export const preflightEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projectId: z.string().uuid(),
      engine: z.enum(["illustrator", "indesign", "figma", "canva", "hybrid", "mock"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const blockers: string[] = [];
    const warnings: string[] = [];

    const { data: project } = await supabase
      .from("projects")
      .select("workspace_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) return { ok: false, blockers: ["Project not found."], warnings: [] };

    const desktopEngines =
      data.engine === "hybrid"
        ? ["illustrator", "indesign"]
        : ["illustrator", "indesign"].includes(data.engine)
          ? [data.engine]
          : [];

    if (desktopEngines.length > 0) {
      const since = new Date(Date.now() - 60_000).toISOString();
      const { data: agents } = await supabase
        .from("agent_pairings")
        .select("name, last_seen")
        .eq("workspace_id", project.workspace_id)
        .gte("last_seen", since);
      if (!agents || agents.length === 0) {
        blockers.push(
          `No desktop agent online in the last 60s. Start the Lovable Agent on the machine that runs ${desktopEngines.join(" / ")}.`,
        );
      }
    }

    const integrationEngines =
      data.engine === "hybrid"
        ? ["figma"]
        : ["figma", "canva"].includes(data.engine)
          ? [data.engine]
          : [];
    for (const provider of integrationEngines) {
      const { data: integ } = await supabase
        .from("workspace_integrations")
        .select("id")
        .eq("workspace_id", project.workspace_id)
        .eq("provider", provider)
        .maybeSingle();
      if (!integ) {
        warnings.push(
          `No ${provider} token saved — ${provider} renders will fail until you connect it.`,
        );
      }
    }

    return { ok: blockers.length === 0, blockers, warnings };
  });

