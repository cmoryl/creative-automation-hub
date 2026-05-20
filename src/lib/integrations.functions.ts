import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

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

// List which providers are connected (metadata only, never the token).
export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    const { data } = await context.supabase
      .from("workspace_integrations")
      .select("provider, metadata, updated_at")
      .eq("workspace_id", wsId);
    return data ?? [];
  });

// Save Canva Connect app credentials (client id + secret). Token exchange happens
// later via OAuth; this just stores the app creds so the OAuth flow can run.
export const saveCanvaCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      clientId: z.string().min(1).max(200),
      clientSecret: z.string().min(1).max(400),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("workspace_integrations")
      .upsert(
        {
          workspace_id: wsId,
          provider: "canva",
          access_token: data.clientSecret, // stored secret column; OAuth tokens overwrite later
          metadata: { client_id: data.clientId, status: "configured" },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,provider" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const disconnectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      provider: z.enum(["figma", "canva", "illustrator", "indesign"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("workspace_integrations")
      .delete()
      .eq("workspace_id", wsId)
      .eq("provider", data.provider);
    if (error) throw error;
    return { ok: true };
  });
