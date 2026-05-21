import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listOutputComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ outputId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("output_comments")
      .select("id, body, author_id, parent_id, created_at")
      .eq("output_id", data.outputId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const ids = Array.from(new Set((rows ?? []).map((r) => r.author_id)));
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", ids)
      : { data: [] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (rows ?? []).map((r) => ({
      ...r,
      author: byId.get(r.author_id) ?? { display_name: "Member", avatar_url: null },
    }));
  });

export const createOutputComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        outputId: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
        parentId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: out, error: outErr } = await supabase
      .from("outputs")
      .select("id, job_id, jobs:job_id ( workspace_id )")
      .eq("id", data.outputId)
      .maybeSingle();
    if (outErr) throw outErr;
    if (!out) throw new Error("Output not found");
    const wsId = (out as { jobs?: { workspace_id?: string } | null }).jobs?.workspace_id;
    if (!wsId) throw new Error("Workspace lookup failed");

    const { data: row, error } = await supabase
      .from("output_comments")
      .insert({
        output_id: data.outputId,
        workspace_id: wsId,
        author_id: userId,
        body: data.body,
        parent_id: data.parentId ?? null,
      })
      .select("id, body, author_id, parent_id, created_at")
      .single();
    if (error) throw error;
    return row;
  });

export const deleteOutputComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("output_comments").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
