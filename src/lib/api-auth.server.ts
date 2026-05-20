// Authenticates external API callers via Authorization: Bearer cap_xxx
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHash } from "crypto";

export type ApiAuth = {
  tokenId: string;
  workspaceId: string;
};

export async function authenticateApi(request: Request): Promise<ApiAuth> {
  const h = request.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401 });
  const token = h.slice(7).trim();
  if (!token) throw new Response("Unauthorized", { status: 401 });
  const hash = createHash("sha256").update(token).digest("hex");

  const { data, error } = await supabaseAdmin
    .from("workspace_api_tokens")
    .select("id, workspace_id")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error || !data) throw new Response("Unauthorized", { status: 401 });

  await supabaseAdmin
    .from("workspace_api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return { tokenId: data.id, workspaceId: data.workspace_id };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}
