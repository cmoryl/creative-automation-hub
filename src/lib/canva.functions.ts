import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import crypto from "crypto";
import { canvaFetch, pollCanvaJob, uploadCanvaAsset } from "./canva.server";

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

// ---------- OAuth start ----------
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
    if (!clientId) throw new Error("Save your Canva Client ID and Secret first.");

    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
    const state = b64url(crypto.randomBytes(24));
    const redirectUri = `${data.origin.replace(/\/$/, "")}/api/public/oauth/canva/callback`;

    const nextMeta = {
      ...(integ?.metadata as any),
      oauth_pending: { state, verifier, redirect_uri: redirectUri, created_at: new Date().toISOString() },
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

// ---------- Browse ----------
export const listCanvaBrandTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ continuation: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    const q = new URLSearchParams();
    if (data.continuation) q.set("continuation", data.continuation);
    const res = await canvaFetch<any>(wsId, `/brand-templates${q.toString() ? `?${q}` : ""}`);
    return {
      items: (res.items ?? []).map((it: any) => ({
        id: it.id,
        title: it.title,
        thumbnail: it.thumbnail?.url ?? null,
        view_url: it.view_url ?? null,
      })),
      continuation: res.continuation ?? null,
    };
  });

export const listCanvaDesigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      query: z.string().max(200).optional(),
      continuation: z.string().optional(),
    }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    const q = new URLSearchParams();
    if (data.query) q.set("query", data.query);
    if (data.continuation) q.set("continuation", data.continuation);
    const res = await canvaFetch<any>(wsId, `/designs${q.toString() ? `?${q}` : ""}`);
    return {
      items: (res.items ?? []).map((it: any) => ({
        id: it.id,
        title: it.title,
        thumbnail: it.thumbnail?.url ?? null,
        urls: it.urls ?? null,
      })),
      continuation: res.continuation ?? null,
    };
  });

// ---------- Import as template ----------
function datasetToVariables(dataset: any): any[] {
  // Canva dataset shape: { fields: { fieldName: { type: 'text'|'image'|'chart' } } }
  const fields = dataset?.fields ?? {};
  return Object.entries(fields).map(([name, def]: any) => ({
    name,
    label: name,
    type: def?.type === "image" ? "image" : def?.type === "chart" ? "text" : "text",
  }));
}

export const importCanvaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      kind: z.enum(["brand_template", "design"]),
      id: z.string().min(1).max(200),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    let name = "Canva item";
    let thumbnail: string | null = null;
    let variables: any[] = [];

    if (data.kind === "brand_template") {
      const meta = await canvaFetch<any>(wsId, `/brand-templates/${data.id}`);
      name = meta.brand_template?.title ?? meta.title ?? name;
      thumbnail = meta.brand_template?.thumbnail?.url ?? null;
      try {
        const ds = await canvaFetch<any>(wsId, `/brand-templates/${data.id}/dataset`);
        variables = datasetToVariables(ds.dataset ?? ds);
      } catch {
        variables = [];
      }
    } else {
      const d = await canvaFetch<any>(wsId, `/designs/${data.id}`);
      name = d.design?.title ?? d.title ?? name;
      thumbnail = d.design?.thumbnail?.url ?? null;
    }

    const sourceRef = `canva://${data.kind}/${data.id}`;
    // Upsert on (workspace_id, source_ref)
    const { data: existing } = await supabaseAdmin
      .from("templates")
      .select("id")
      .eq("workspace_id", wsId)
      .eq("source_ref", sourceRef)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from("templates")
        .update({ name, preview_url: thumbnail, variables, engine: "canva" })
        .eq("id", existing.id);
      if (error) throw error;
      return { id: existing.id, updated: true };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("templates")
      .insert({
        workspace_id: wsId,
        engine: "canva",
        name,
        source_ref: sourceRef,
        preview_url: thumbnail,
        variables,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: ins.id, updated: false };
  });

// ---------- Asset upload (push product_asset to Canva) ----------
export const pushAssetToCanva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ productAssetId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    const { data: asset, error } = await supabaseAdmin
      .from("product_assets")
      .select("id, name, url, metadata, workspace_id")
      .eq("id", data.productAssetId)
      .single();
    if (error) throw error;
    if (asset.workspace_id !== wsId) throw new Error("Asset not in this workspace");

    const existingId = (asset.metadata as any)?.canva_asset_id as string | undefined;
    if (existingId) return { assetId: existingId, cached: true };

    const dl = await fetch(asset.url);
    if (!dl.ok) throw new Error(`Failed to download asset (${dl.status})`);
    const bytes = new Uint8Array(await dl.arrayBuffer());
    const fileName = asset.name || `${asset.id}.png`;
    const canvaAssetId = await uploadCanvaAsset(wsId, bytes, fileName);

    await supabaseAdmin
      .from("product_assets")
      .update({ metadata: { ...(asset.metadata as any), canva_asset_id: canvaAssetId } })
      .eq("id", asset.id);
    return { assetId: canvaAssetId, cached: false };
  });

// ---------- Run a Canva job (autofill + export) ----------
async function resolveImageRef(
  workspaceId: string,
  value: string,
): Promise<string> {
  // value is a product_asset id OR a URL. Returns a canva asset_id.
  if (!value) throw new Error("Empty image value");
  // UUID? then look up product_asset
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    const { data: pa, error } = await supabaseAdmin
      .from("product_assets")
      .select("id, name, url, metadata, workspace_id")
      .eq("id", value)
      .single();
    if (error) throw error;
    if (pa.workspace_id !== workspaceId) throw new Error("Asset not in workspace");
    const existing = (pa.metadata as any)?.canva_asset_id;
    if (existing) return existing;
    const dl = await fetch(pa.url);
    const bytes = new Uint8Array(await dl.arrayBuffer());
    const id = await uploadCanvaAsset(workspaceId, bytes, pa.name || `${pa.id}.png`);
    await supabaseAdmin
      .from("product_assets")
      .update({ metadata: { ...(pa.metadata as any), canva_asset_id: id } })
      .eq("id", pa.id);
    return id;
  }
  // Otherwise treat as URL
  const dl = await fetch(value);
  if (!dl.ok) throw new Error(`Failed to download image (${dl.status})`);
  const bytes = new Uint8Array(await dl.arrayBuffer());
  const fileName = value.split("/").pop()?.split("?")[0] || "image.png";
  return uploadCanvaAsset(workspaceId, bytes, fileName);
}

function buildAutofillData(variables: any[], values: Record<string, string>) {
  const out: Record<string, any> = {};
  for (const v of variables) {
    const raw = values[v.name];
    if (raw == null || raw === "") continue;
    if (v.type === "image") {
      // resolved later
      out[v.name] = { type: "image", _raw: raw };
    } else {
      out[v.name] = { type: "text", text: String(raw) };
    }
  }
  return out;
}

async function uploadBlobToJobOutputs(jobId: string, ext: string, bytes: Uint8Array, idx: number) {
  const path = `canva/${jobId}/${idx}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from("job-outputs")
    .upload(path, bytes, {
      contentType:
        ext === "png" ? "image/png"
        : ext === "jpg" ? "image/jpeg"
        : ext === "pdf" ? "application/pdf"
        : ext === "mp4" ? "video/mp4"
        : "application/octet-stream",
      upsert: true,
    });
  if (error) throw error;
  const { data } = supabaseAdmin.storage.from("job-outputs").getPublicUrl(path);
  return data.publicUrl;
}

export const runCanvaJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projectId: z.string().uuid(),
      templateId: z.string().uuid(),
      variables: z.record(z.string(), z.string()).default({}),
      title: z.string().max(200).optional(),
      format: z.enum(["png", "jpg", "pdf", "mp4"]).default("png"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);

    const { data: tpl, error: tplErr } = await supabaseAdmin
      .from("templates")
      .select("id, name, engine, source_ref, variables, workspace_id")
      .eq("id", data.templateId)
      .single();
    if (tplErr) throw tplErr;
    if (tpl.workspace_id !== wsId) throw new Error("Template not in workspace");
    if (tpl.engine !== "canva") throw new Error("Template is not a Canva template");
    const ref = String(tpl.source_ref ?? "");
    const m = ref.match(/^canva:\/\/(brand_template|design)\/(.+)$/);
    if (!m) throw new Error("Template is missing a Canva source_ref");
    const kind = m[1] as "brand_template" | "design";
    const canvaId = m[2];

    // Insert job row
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("jobs")
      .insert({
        project_id: data.projectId,
        workspace_id: wsId,
        template_id: tpl.id,
        engine: "canva",
        status: "running",
        brief: { canva: { kind, canva_id: canvaId, format: data.format } },
        variables: data.variables,
      })
      .select("id")
      .single();
    if (jobErr) throw jobErr;
    const jobId = job.id as string;

    try {
      let designId: string;
      if (kind === "brand_template") {
        // Resolve image vars to Canva asset ids
        const autoData = buildAutofillData((tpl.variables as any[]) ?? [], data.variables);
        for (const [k, v] of Object.entries(autoData)) {
          if (v.type === "image") {
            const assetId = await resolveImageRef(wsId, v._raw);
            autoData[k] = { type: "image", asset_id: assetId };
          }
        }
        const created = await canvaFetch<any>(wsId, `/autofills`, {
          method: "POST",
          body: JSON.stringify({
            brand_template_id: canvaId,
            title: data.title ?? tpl.name,
            data: autoData,
          }),
        });
        const autofillJobId = created.job?.id;
        if (!autofillJobId) throw new Error("Canva autofill returned no job id");
        const done: any = await pollCanvaJob(wsId, () => `/autofills/${autofillJobId}`, { timeoutMs: 180_000 });
        if (done.job?.status !== "success") {
          throw new Error(`Canva autofill failed: ${JSON.stringify(done.job ?? done)}`);
        }
        designId = done.job?.result?.design?.id ?? done.job?.design?.id;
        if (!designId) throw new Error("Canva autofill finished without a design id");
      } else {
        designId = canvaId;
      }

      // Export
      const exportFormat: any =
        data.format === "pdf" ? { type: "pdf", size: "a4" }
        : data.format === "mp4" ? { type: "mp4", quality: "horizontal_1080p" }
        : data.format === "jpg" ? { type: "jpg", quality: 90 }
        : { type: "png" };

      const created = await canvaFetch<any>(wsId, `/exports`, {
        method: "POST",
        body: JSON.stringify({ design_id: designId, format: exportFormat }),
      });
      const exportJobId = created.job?.id;
      if (!exportJobId) throw new Error("Canva export returned no job id");
      const exDone: any = await pollCanvaJob(wsId, () => `/exports/${exportJobId}`, { timeoutMs: 240_000 });
      if (exDone.job?.status !== "success") {
        throw new Error(`Canva export failed: ${JSON.stringify(exDone.job ?? exDone)}`);
      }
      const urls: string[] = exDone.job?.urls ?? [];
      if (!urls.length) throw new Error("Canva export produced no urls");

      const outputs: { id: string; url: string }[] = [];
      for (let i = 0; i < urls.length; i++) {
        const dl = await fetch(urls[i]);
        if (!dl.ok) throw new Error(`Failed to download export ${i} (${dl.status})`);
        const bytes = new Uint8Array(await dl.arrayBuffer());
        const ext = data.format === "jpg" ? "jpg" : data.format;
        const publicUrl = await uploadBlobToJobOutputs(jobId, ext, bytes, i);
        const { data: out, error: outErr } = await supabaseAdmin
          .from("outputs")
          .insert({
            job_id: jobId,
            kind: ext,
            url: publicUrl,
            metadata: { canva_design_id: designId, canva_export_id: exportJobId, index: i },
          })
          .select("id, url")
          .single();
        if (outErr) throw outErr;
        outputs.push({ id: out.id, url: out.url });
      }

      await supabaseAdmin
        .from("jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          brief: { canva: { kind, canva_id: canvaId, format: data.format, design_id: designId, export_id: exportJobId } },
        })
        .eq("id", jobId);
      return { jobId, outputs, designId };
    } catch (e: any) {
      await supabaseAdmin
        .from("jobs")
        .update({ status: "failed", error: String(e?.message ?? e) })
        .eq("id", jobId);
      throw e;
    }
  });

// ---------- Bulk runs ----------
export const runCanvaBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projectId: z.string().uuid(),
      templateId: z.string().uuid(),
      batchLabel: z.string().min(1).max(200),
      format: z.enum(["png", "jpg", "pdf", "mp4"]).default("png"),
      rows: z.array(
        z.object({
          label: z.string().min(1).max(200),
          values: z.record(z.string(), z.string()),
        }),
      ).min(1).max(200),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    const batchKey = `canva-${Date.now()}-${b64url(crypto.randomBytes(6))}`;
    const { data: approval, error: appErr } = await supabaseAdmin
      .from("batch_approvals")
      .insert({
        workspace_id: wsId,
        project_id: data.projectId,
        batch_key: batchKey,
        title: data.batchLabel,
        submitted_by: context.userId,
        status: "pending",
        metadata: { engine: "canva", template_id: data.templateId, count: data.rows.length },
      })
      .select("id")
      .single();
    if (appErr) throw appErr;

    // Fan out — run inline, but mark each job with approval id.
    // To keep the request manageable we run sequentially with try/catch per row.
    const results: { label: string; jobId?: string; error?: string }[] = [];
    for (const row of data.rows) {
      try {
        const r: any = await runCanvaJob({
          data: {
            projectId: data.projectId,
            templateId: data.templateId,
            variables: row.values,
            title: row.label,
            format: data.format,
          },
        });
        await supabaseAdmin
          .from("jobs")
          .update({ approval_id: approval.id, row_label: row.label })
          .eq("id", r.jobId);
        results.push({ label: row.label, jobId: r.jobId });
      } catch (e: any) {
        results.push({ label: row.label, error: String(e?.message ?? e) });
      }
    }
    return { batchId: approval.id, batchKey, results };
  });

// ---------- Webhook secret management ----------
export const ensureCanvaWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    const { data: integ } = await supabaseAdmin
      .from("workspace_integrations")
      .select("metadata")
      .eq("workspace_id", wsId)
      .eq("provider", "canva")
      .maybeSingle();
    const meta = (integ?.metadata as any) ?? {};
    if (meta.webhook_secret) return { secret: meta.webhook_secret as string, url: `/api/public/webhooks/canva` };
    const secret = b64url(crypto.randomBytes(32));
    await supabaseAdmin
      .from("workspace_integrations")
      .update({ metadata: { ...meta, webhook_secret: secret }, updated_at: new Date().toISOString() })
      .eq("workspace_id", wsId)
      .eq("provider", "canva");
    return { secret, url: `/api/public/webhooks/canva` };
  });

// ---------- List Canva templates (with variables) for runner UI ----------
export const listCanvaTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("templates")
      .select("id, name, preview_url, source_ref, variables")
      .eq("engine", "canva")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((t) => ({
      id: t.id as string,
      name: t.name as string,
      preview_url: t.preview_url as string | null,
      source_ref: t.source_ref as string | null,
      variables: Array.isArray(t.variables) ? (t.variables as any[]) : [],
    }));
  });
