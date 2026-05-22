// Server-only Adobe Firefly Services / Photoshop API client.
// Uses Adobe IMS server-to-server (OAuth client_credentials) for auth.
// Credentials live in workspace_integrations(provider='express'):
//   access_token column: Adobe client_secret
//   metadata: { client_id, org_id, scopes, access_token, expires_at }
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const IMS_BASE = "https://ims-na1.adobelogin.com";
const FIREFLY_BASE = "https://firefly-api.adobe.io";
const PHOTOSHOP_BASE = "https://image.adobe.io";
const DEFAULT_SCOPES = "openid,AdobeID,session,additional_info,read_organizations,firefly_api,ff_apis";

export class ExpressNotConfiguredError extends Error {
  code = "express_not_configured" as const;
  constructor(msg = "Adobe Express is not connected. Save Firefly Services credentials in Settings → Integrations.") {
    super(msg);
    this.name = "ExpressNotConfiguredError";
  }
}

type IntegRow = {
  workspace_id: string;
  access_token: string; // Adobe client_secret
  metadata: any;
};

async function loadIntegration(workspaceId: string): Promise<IntegRow> {
  const { data, error } = await supabaseAdmin
    .from("workspace_integrations")
    .select("workspace_id, access_token, metadata")
    .eq("workspace_id", workspaceId)
    .eq("provider", "express")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ExpressNotConfiguredError();
  return data as IntegRow;
}

const inflight = new Map<string, Promise<string>>();

export async function getAdobeAccessToken(workspaceId: string): Promise<string> {
  const existing = inflight.get(workspaceId);
  if (existing) return existing;
  const p = (async () => {
    const row = await loadIntegration(workspaceId);
    const meta = row.metadata ?? {};
    const cached: string | undefined = meta.access_token;
    const expIso: string | undefined = meta.expires_at;
    if (cached && expIso && Date.parse(expIso) - 60_000 > Date.now()) return cached;
    if (!meta.client_id) throw new ExpressNotConfiguredError("Missing Adobe client_id.");
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: meta.client_id,
      client_secret: row.access_token,
      scope: meta.scopes || DEFAULT_SCOPES,
    });
    const r = await fetch(`${IMS_BASE}/ims/token/v3`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json: any = await r.json().catch(() => ({}));
    if (!r.ok || !json.access_token) {
      throw new Error(`Adobe IMS auth failed [${r.status}]: ${JSON.stringify(json).slice(0, 300)}`);
    }
    const expiresAt = new Date(Date.now() + (Number(json.expires_in) || 3600) * 1000).toISOString();
    await supabaseAdmin
      .from("workspace_integrations")
      .update({
        metadata: { ...meta, access_token: json.access_token, expires_at: expiresAt, last_auth_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId)
      .eq("provider", "express");
    return json.access_token as string;
  })().finally(() => inflight.delete(workspaceId));
  inflight.set(workspaceId, p);
  return p;
}

async function adobeFetch<T>(
  workspaceId: string,
  base: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAdobeAccessToken(workspaceId);
  const row = await loadIntegration(workspaceId);
  const clientId = row.metadata?.client_id as string;
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "x-api-key": clientId,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await r.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!r.ok) throw new Error(`Adobe ${path} [${r.status}]: ${JSON.stringify(json).slice(0, 400)}`);
  return json as T;
}

// ---------- Firefly text-to-image (v3 async) ----------
export type FireflyOptions = {
  size?: { width: number; height: number };
  contentClass?: "photo" | "art" | "graphic";
  numVariations?: 1 | 2 | 3 | 4;
  seeds?: number[];
  negativePrompt?: string;
  styles?: { presets?: string[]; strength?: number };
};

export async function fireflyGenerateImages(
  workspaceId: string,
  prompt: string,
  opts: FireflyOptions = {},
): Promise<{ outputs: { url: string; seed?: number }[]; raw: any }> {
  const body: any = {
    prompt,
    n: opts.numVariations ?? 1,
    size: opts.size ?? { width: 1024, height: 1024 },
  };
  if (opts.contentClass) body.contentClass = opts.contentClass;
  if (opts.seeds?.length) body.seeds = opts.seeds;
  if (opts.negativePrompt) body.negativePrompt = opts.negativePrompt;
  if (opts.styles) body.style = opts.styles;

  // v3 async returns {jobId, statusUrl}; fall back to sync v3 if async unavailable.
  const start = await adobeFetch<any>(workspaceId, FIREFLY_BASE, "/v3/images/generate-async", {
    method: "POST",
    body: JSON.stringify(body),
  }).catch(async (e) => {
    if (String(e).includes("[404]") || String(e).includes("[405]")) {
      return adobeFetch<any>(workspaceId, FIREFLY_BASE, "/v3/images/generate", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }
    throw e;
  });

  const result = await pollAdobeJob(workspaceId, start, { timeoutMs: 180_000 });
  const outs = (result?.result?.outputs ?? result?.outputs ?? []).map((o: any) => ({
    url: o?.image?.url ?? o?.url ?? o?.presignedUrl,
    seed: o?.seed,
  })).filter((o: any) => !!o.url);
  return { outputs: outs, raw: result };
}

// ---------- Photoshop API: text replace inside a PSD ----------
export async function psdTextReplace(
  workspaceId: string,
  input: { psdUrl: string; outputStorage?: "external" | "adobe"; edits: { layerName: string; text?: string; color?: string }[] },
): Promise<{ outputs: { url: string }[]; raw: any }> {
  const body = {
    inputs: [{ href: input.psdUrl, storage: "external" }],
    options: {
      layers: input.edits.map((e) => ({
        edit: {},
        name: e.layerName,
        text: e.text != null ? { content: e.text, ...(e.color ? { fontColor: hexToFontColor(e.color) } : {}) } : undefined,
      })),
    },
    outputs: [{ storage: "external", type: "image/png", overwrite: true, href: "" /* server fills */ }],
  };
  const start = await adobeFetch<any>(workspaceId, PHOTOSHOP_BASE, "/pie/psdService/text", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const result = await pollAdobeJob(workspaceId, start, { timeoutMs: 240_000 });
  const outs = (result?.outputs ?? []).map((o: any) => ({ url: o?._links?.renditions?.[0]?.href ?? o?.href })).filter((o: any) => !!o.url);
  return { outputs: outs, raw: result };
}

function hexToFontColor(hex: string) {
  const m = hex.replace("#", "");
  return { rgb: { red: parseInt(m.slice(0, 2), 16), green: parseInt(m.slice(2, 4), 16), blue: parseInt(m.slice(4, 6), 16) } };
}

// ---------- Polling helper for Firefly / Photoshop async jobs ----------
export type AdobePollProgress = {
  stage: "starting" | "polling" | "succeeded" | "failed";
  percent: number;
  message: string;
  attempts: number;
  status?: string;
};

export async function pollAdobeJob(
  workspaceId: string,
  start: any,
  {
    timeoutMs = 180_000,
    intervalMs = 2_500,
    onProgress,
  }: { timeoutMs?: number; intervalMs?: number; onProgress?: (p: AdobePollProgress) => void | Promise<void> } = {},
): Promise<any> {
  // If response already contains results, return as-is.
  if (start?.outputs || start?.result?.outputs) {
    await onProgress?.({ stage: "succeeded", percent: 100, message: "Completed", attempts: 0, status: "ok" });
    return start;
  }
  const statusUrl: string | undefined =
    start?._links?.self?.href ?? start?.statusUrl ?? start?.jobUrl ?? start?.href;
  if (!statusUrl) return start;
  await onProgress?.({ stage: "starting", percent: 5, message: "Adobe job queued", attempts: 0 });
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts++;
    const token = await getAdobeAccessToken(workspaceId);
    const row = await loadIntegration(workspaceId);
    const r = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${token}`, "x-api-key": row.metadata?.client_id as string },
    });
    const j: any = await r.json().catch(() => ({}));
    const status = j?.status ?? j?.jobStatus;
    if (status === "succeeded" || status === "SUCCEEDED" || status === "ok") {
      await onProgress?.({ stage: "succeeded", percent: 95, message: "Render complete, downloading…", attempts, status });
      return j;
    }
    if (status === "failed" || status === "FAILED" || j?.error) {
      await onProgress?.({ stage: "failed", percent: 100, message: j?.error?.message ?? "Adobe job failed", attempts, status });
      throw new Error(`Adobe job failed: ${JSON.stringify(j).slice(0, 400)}`);
    }
    // Progress curve: ramp from 10 → 85 over ~30 polls.
    const pct = Math.min(85, 10 + attempts * 2.5);
    await onProgress?.({ stage: "polling", percent: pct, message: `Rendering (${status ?? "in progress"})`, attempts, status });
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  await onProgress?.({ stage: "failed", percent: 100, message: "Adobe job timed out", attempts });
  throw new Error("Adobe job timed out");
}

// ---------- Verify credentials ----------
export async function verifyExpressCredentials(workspaceId: string) {
  await getAdobeAccessToken(workspaceId);
  // Light ping: list Firefly models endpoint (cheap, requires only firefly_api scope).
  await adobeFetch<any>(workspaceId, FIREFLY_BASE, "/v3/models", { method: "GET" }).catch(() => {});
  return { ok: true };
}
