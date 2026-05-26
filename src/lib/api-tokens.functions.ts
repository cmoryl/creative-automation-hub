import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function getWorkspaceId(supabase: any, userId: string) {
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("No workspace");
  return data.id as string;
}

export const listApiTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("workspace_api_tokens")
      .select("id, name, last_used_at, created_at")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createApiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ name: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    const token = "cap_" + randomBytes(24).toString("base64url");
    const { data: row, error } = await context.supabase
      .from("workspace_api_tokens")
      .insert({
        workspace_id: wsId,
        name: data.name,
        token_hash: sha256(token),
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id, token, workspaceId: wsId };
  });

export const deleteApiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workspace_api_tokens")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
