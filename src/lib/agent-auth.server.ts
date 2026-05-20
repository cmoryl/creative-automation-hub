// Shared helpers for /api/public/agent/* endpoints.
// Authenticates the bridge agent via Authorization: Bearer <pairing_token>
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHash } from "crypto";

export type AgentAuth = {
  agentId: string;
  workspaceId: string;
  name: string;
};

export async function authenticateAgent(request: Request): Promise<AgentAuth> {
  const h = request.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401 });
  const token = h.slice(7).trim();
  if (!token) throw new Response("Unauthorized", { status: 401 });
  const hash = createHash("sha256").update(token).digest("hex");

  const { data, error } = await supabaseAdmin
    .from("agent_pairings")
    .select("id, workspace_id, name")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error || !data) throw new Response("Unauthorized", { status: 401 });

  await supabaseAdmin
    .from("agent_pairings")
    .update({ last_seen: new Date().toISOString() })
    .eq("id", data.id);

  return { agentId: data.id, workspaceId: data.workspace_id, name: data.name };
}

export function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}
