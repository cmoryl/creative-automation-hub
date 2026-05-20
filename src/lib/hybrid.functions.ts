import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Fan out a single brief into one job per requested engine.
// AI/ID jobs land in the queue for the local bridge agent; Figma/Canva run server-side.
export const createHybridRender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projectId: z.string().uuid(),
      engines: z
        .array(z.enum(["illustrator", "indesign", "figma", "canva", "claude"]))
        .min(1)
        .max(5),
      templateIds: z.record(z.string().uuid()).optional(), // engine -> templateId
      brief: z.record(z.unknown()).default({}),
      variables: z.record(z.unknown()).default({}),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const rows = data.engines.map((engine) => ({
      project_id: data.projectId,
      engine,
      template_id: data.templateIds?.[engine] ?? null,
      brief: data.brief as never,
      variables: { ...data.variables, hybrid_group: crypto.randomUUID() } as never,
      status: "queued",
    }));
    const { data: jobs, error } = await supabase
      .from("jobs")
      .insert(rows)
      .select("id, engine, status");
    if (error) throw error;
    return { jobs };
  });
