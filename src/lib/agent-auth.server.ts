// Shared helpers for /api/public/agent/* endpoints.
// Authenticates the bridge agent via Authorization: Bearer <pairing_token>
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHash } from "crypto";

export type AgentAuth = {
  agentId: string;
  workspaceId: string;
  name: string;
};

// Build a structured 401 so the local agent (or curl) sees a clear reason
// instead of a bare "Unauthorized". The agent surfaces this verbatim in its
// log so the user knows whether to re-pair, fix their token, or check the URL.
function unauthorized(reason: string, message: string): Response {
  return new Response(
    JSON.stringify({ error: "Unauthorized", reason, message }),
    {
      status: 401,
      headers: { "content-type": "application/json" },
    },
  );
}

export async function authenticateAgent(request: Request): Promise<AgentAuth> {
  const h = request.headers.get("authorization");
  if (!h) {
    throw unauthorized(
      "missing_authorization_header",
      "Authorization header is missing. The bridge agent must send 'Authorization: Bearer <token>'.",
    );
  }
  if (!h.startsWith("Bearer ")) {
    throw unauthorized(
      "bad_authorization_scheme",
      "Authorization header must use the 'Bearer <token>' scheme.",
    );
  }
  const token = h.slice(7).trim();
  if (!token) {
    throw unauthorized(
      "empty_token",
      "Bearer token is empty. Paste the token shown once after clicking 'Create token' in Settings.",
    );
  }
  if (token.length < 16) {
    throw unauthorized(
      "malformed_token",
      "Pairing token looks malformed (too short). Re-create it in Settings → Local Bridge Agent.",
    );
  }

  const hash = createHash("sha256").update(token).digest("hex");

  const { data, error } = await supabaseAdmin
    .from("agent_pairings")
    .select("id, workspace_id, name")
    .eq("token_hash", hash)
    .maybeSingle();

  if (error) {
    // Surface infra problems distinctly from bad tokens so the agent log is
    // accurate ("backend unavailable" vs "fix your token").
    throw new Response(
      JSON.stringify({
        error: "Internal",
        reason: "lookup_failed",
        message: `Could not look up pairing token: ${error.message}`,
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  if (!data) {
    throw unauthorized(
      "token_unknown",
      "Pairing token not recognised. It may have been revoked — re-pair this machine in Settings → Local Bridge Agent.",
    );
  }

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
