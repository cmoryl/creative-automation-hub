import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import crypto from "crypto";

const CANVA_SCOPES = [
  "design:content:read",
  "design:content:write",
  "design:meta:read",
  "design:permission:read",
  "design:permission:write",
  "asset:read",
  "asset:write",
  "brandtemplate:meta:read",
  "brandtemplate:content:read",
  "folder:read",
  "folder:write",
  "folder:permission:read",
  "folder:permission:write",
  "comment:read",
  "comment:write",
  "profile:read",
  "app:read",
  "app:write",
].join(" ");

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

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

// Build the Canva authorization URL and stash PKCE verifier + state.
export const startCanvaOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ origin: z.string().url().max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);

    const { data: integ } = await supabaseAdmin
      .from("workspace_integrations")
      .select("access_token, metadata")
      .eq("workspace_id", wsId)
      .eq("provider", "canva")
      .maybeSingle();

    const clientId = (integ?.metadata as any)?.client_id;
    if (!clientId) {
      throw new Error("Save your Canva Client ID and Secret first.");
    }

    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
    const state = b64url(crypto.randomBytes(24));

    const redirectUri = `${data.origin.replace(/\/$/, "")}/api/public/oauth/canva/callback`;


    const nextMeta = {
      ...(integ?.metadata as any),
      oauth_pending: {
        state,
        verifier,
        redirect_uri: redirectUri,
        created_at: new Date().toISOString(),
      },
    };

    const { error } = await supabaseAdmin
      .from("workspace_integrations")
      .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
      .eq("workspace_id", wsId)
      .eq("provider", "canva");
    if (error) throw error;

    const params = new URLSearchParams({
      code_challenge_method: "s256",
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: CANVA_SCOPES,
      code_challenge: challenge,
      state,
    });

    return {
      authorizeUrl: `https://www.canva.com/api/oauth/authorize?${params.toString()}`,
      redirectUri,
    };
  });

// Read the redirect URI the app will use (for display in the UI / Canva app config).
export const getCanvaRedirectUri = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const host = getRequestHost();
    const proto = host.includes("localhost") ? "http" : "https";
    return { redirectUri: `${proto}://${host}/api/public/oauth/canva/callback` };
  });
