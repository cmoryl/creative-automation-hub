// Server-only Canva API client with auto token refresh.
// Never import this file from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CANVA_BASE = "https://api.canva.com/rest/v1";

// Typed error so server fns / UI can show a "Reconnect Canva" prompt instead
// of a blank screen. The lineage is gone — only re-auth fixes it.
export class CanvaReauthRequiredError extends Error {
  code = "canva_reauth_required" as const;
  constructor(message = "Canva needs to be reconnected. Click Authorize Canva account.") {
    super(message);
    this.name = "CanvaReauthRequiredError";
  }
}

export class CanvaRateLimitedError extends Error {
  code = "canva_rate_limited" as const;
  retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`Canva is rate-limiting token refreshes. Try again in ${Math.ceil(retryAfterMs / 1000)}s.`);
    this.name = "CanvaRateLimitedError";
    this.retryAfterMs = retryAfterMs;
  }
}

type IntegRow = {
  workspace_id: string;
  access_token: string; // we store the user's OAuth access token here once connected
  metadata: any;
};

// Single-flight refresh per workspace within this worker instance — prevents a
// burst of parallel server-fn calls from each firing their own refresh and
// tripping Canva's 429.
const inflightRefreshes = new Map<string, Promise<IntegRow>>();

async function loadIntegration(workspaceId: string): Promise<IntegRow> {
  const { data, error } = await supabaseAdmin
    .from("workspace_integrations")
    .select("workspace_id, access_token, metadata")
    .eq("workspace_id", workspaceId)
    .eq("provider", "canva")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Canva is not connected for this workspace.");
  const row = data as IntegRow;
  if (!row.metadata?.access_token) throw new CanvaReauthRequiredError();
  return row;
}

async function persistTokens(workspaceId: string, currentMeta: any, tokenJson: any) {
  const expiresAt = tokenJson.expires_in
    ? new Date(Date.now() + Number(tokenJson.expires_in) * 1000).toISOString()
    : null;
  const nextMeta = {
    ...currentMeta,
    access_token: tokenJson.access_token,
    refresh_token: tokenJson.refresh_token ?? currentMeta.refresh_token ?? null,
    token_type: tokenJson.token_type ?? "Bearer",
    expires_at: expiresAt,
    scope: tokenJson.scope ?? currentMeta.scope ?? null,
    refresh_cooldown_until: null,
    needs_reauth: false,
  };
  await supabaseAdmin
    .from("workspace_integrations")
    .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("provider", "canva");
  return nextMeta;
}

async function markReauthRequired(workspaceId: string, currentMeta: any, reason: string) {
  const nextMeta = {
    ...currentMeta,
    // Drop the dead credentials so we stop trying to refresh them.
    access_token: null,
    refresh_token: null,
    expires_at: null,
    needs_reauth: true,
    reauth_reason: reason,
    reauth_at: new Date().toISOString(),
  };
  await supabaseAdmin
    .from("workspace_integrations")
    .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("provider", "canva");
}

async function markRefreshCooldown(workspaceId: string, currentMeta: any, untilMs: number) {
  const nextMeta = {
    ...currentMeta,
    refresh_cooldown_until: new Date(untilMs).toISOString(),
  };
  await supabaseAdmin
    .from("workspace_integrations")
    .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("provider", "canva");
}

async function doRefresh(integ: IntegRow): Promise<IntegRow> {
  const meta = integ.metadata as any;

  // If a previous refresh tripped 429, honour the cooldown rather than retrying.
  const cooldownUntil = meta.refresh_cooldown_until
    ? new Date(meta.refresh_cooldown_until).getTime()
    : 0;
  if (cooldownUntil && cooldownUntil > Date.now()) {
    throw new CanvaRateLimitedError(cooldownUntil - Date.now());
  }

  if (meta.needs_reauth || !meta.refresh_token) {
    throw new CanvaReauthRequiredError();
  }

  const clientId = meta.client_id as string;
  const clientSecret = integ.access_token as string;
  if (!clientId || !clientSecret) throw new Error("Missing Canva client credentials.");

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${CANVA_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: meta.refresh_token,
    }).toString(),
  });
  const json = await res.json().catch(() => ({} as any));

  if (res.ok) {
    const nextMeta = await persistTokens(integ.workspace_id, meta, json);
    return { ...integ, metadata: nextMeta };
  }

  // Permanent: refresh token revoked / lineage gone. Drop creds, demand re-auth.
  if (res.status === 400 && /invalid_grant|revoked/i.test(JSON.stringify(json))) {
    await markReauthRequired(integ.workspace_id, meta, json?.error_description ?? "invalid_grant");
    throw new CanvaReauthRequiredError();
  }

  // Transient: rate limited. Park a cooldown so concurrent / subsequent callers
  // back off instead of stampeding the endpoint.
  if (res.status === 429) {
    const retryAfterHeader = Number(res.headers.get("retry-after")) || 60;
    const untilMs = Date.now() + retryAfterHeader * 1000;
    await markRefreshCooldown(integ.workspace_id, meta, untilMs);
    throw new CanvaRateLimitedError(retryAfterHeader * 1000);
  }

  throw new Error(`Canva token refresh failed (${res.status}): ${JSON.stringify(json)}`);
}

async function refreshIfNeeded(integ: IntegRow): Promise<IntegRow> {
  const meta = integ.metadata as any;
  const expiresAt = meta.expires_at ? new Date(meta.expires_at).getTime() : 0;
  const stale = !expiresAt || expiresAt - Date.now() < 60_000;
  if (!stale) return integ;
  if (meta.needs_reauth) throw new CanvaReauthRequiredError();
  if (!meta.refresh_token) throw new CanvaReauthRequiredError();

  const key = integ.workspace_id;
  const existing = inflightRefreshes.get(key);
  if (existing) return existing;
  const p = doRefresh(integ).finally(() => inflightRefreshes.delete(key));
  inflightRefreshes.set(key, p);
  return p;
}

export async function canvaFetch<T = any>(
  workspaceId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let integ = await loadIntegration(workspaceId);
  integ = await refreshIfNeeded(integ);
  const doCall = async () => {
    const headers = new Headers(init.headers ?? {});
    headers.set("Authorization", `Bearer ${integ.metadata.access_token}`);
    if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(`${CANVA_BASE}${path}`, { ...init, headers });
  };

  let res = await doCall();
  if (res.status === 401) {
    // Force refresh and retry once.
    const meta = integ.metadata as any;
    if (meta.refresh_token) {
      integ.metadata.expires_at = new Date(0).toISOString();
      integ = await refreshIfNeeded(integ);
      res = await doCall();
    }
  }
  const text = await res.text();
  const json = text ? safeJson(text) : ({} as any);
  if (!res.ok) {
    throw new Error(`Canva ${path} failed (${res.status}): ${typeof json === "string" ? json : JSON.stringify(json)}`);
  }
  return json as T;
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return s; }
}

// Poll a Canva job-style endpoint until it leaves 'in_progress'.
export async function pollCanvaJob<T = any>(
  workspaceId: string,
  pathBuilder: () => string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const timeout = options.timeoutMs ?? 120_000;
  const interval = options.intervalMs ?? 2000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const r = await canvaFetch<any>(workspaceId, pathBuilder());
    const status = r.job?.status ?? r.export?.status ?? r.status;
    if (status && status !== "in_progress") return r as T;
    await new Promise((res) => setTimeout(res, interval));
  }
  throw new Error("Canva job timed out");
}

// Upload arbitrary bytes as a Canva asset. Canva expects multipart with
// 'Asset-Upload-Metadata' header. Returns the created asset id.
export async function uploadCanvaAsset(
  workspaceId: string,
  bytes: ArrayBuffer | Uint8Array,
  fileName: string,
): Promise<string> {
  let integ = await loadIntegration(workspaceId);
  integ = await refreshIfNeeded(integ);
  const meta = { name_base64: Buffer.from(fileName).toString("base64") };
  const res = await fetch(`${CANVA_BASE}/asset-uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${integ.metadata.access_token}`,
      "Content-Type": "application/octet-stream",
      "Asset-Upload-Metadata": JSON.stringify(meta),
    },
    body: bytes as any,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Canva asset upload failed (${res.status}): ${JSON.stringify(json)}`);
  // Returns a job — poll
  const jobId = json.job?.id;
  if (!jobId) throw new Error("Canva asset upload returned no job id");
  const done: any = await pollCanvaJob(workspaceId, () => `/asset-uploads/${jobId}`);
  const assetId = done.job?.asset?.id ?? done.asset?.id;
  if (!assetId) throw new Error(`Canva asset upload finished without id: ${JSON.stringify(done)}`);
  return assetId as string;
}

export function canvaWebhookSecret(meta: any): string | null {
  return meta?.webhook_secret ?? null;
}
