import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import {
  fireflyGenerateImages,
  psdTextReplace,
  verifyExpressCredentials,
  ExpressNotConfiguredError,
} from "./express.server";

async function getWorkspaceId(supabase: any, userId: string) {
  const { data } = await supabase
    .from("workspaces").select("id").eq("owner_id", userId).limit(1).maybeSingle();
  if (!data) throw new Error("No workspace");
  return data.id as string;
}

// ---------- Credentials ----------
export const saveExpressCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      clientId: z.string().min(5).max(200),
      clientSecret: z.string().min(5).max(400),
      orgId: z.string().min(1).max(200).optional(),
      scopes: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("workspace_integrations")
      .upsert(
        {
          workspace_id: wsId,
          provider: "express",
          access_token: data.clientSecret,
          metadata: {
            client_id: data.clientId,
            org_id: data.orgId ?? null,
            scopes: data.scopes ?? null,
            status: "configured",
            access_token: null,
            expires_at: null,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,provider" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const testExpressConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    try {
      await verifyExpressCredentials(wsId);
      await supabaseAdmin
        .from("workspace_integrations")
        .update({ metadata: { status: "connected", verified_at: new Date().toISOString() } as any })
        .eq("workspace_id", wsId)
        .eq("provider", "express");
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  });

export const listExpressCapabilities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    capabilities: [
      { id: "firefly-text-to-image", name: "Firefly text-to-image", description: "Generate brand-safe images from a text prompt (v3 model)." },
      { id: "firefly-generative-fill", name: "Generative fill", description: "Replace or extend regions of an image with a text prompt." },
      { id: "firefly-generative-expand", name: "Generative expand", description: "Outpaint to a new aspect ratio." },
      { id: "photoshop-text-replace", name: "Photoshop PSD text replace", description: "Swap text layers in a master PSD by layer name." },
      { id: "photoshop-smart-object", name: "Photoshop smart object swap", description: "Replace a smart object (logo/product shot) inside a PSD." },
      { id: "document-generation", name: "InDesign Server / Document API", description: "Render PDFs from a master with merge fields." },
    ],
  }));

// ---------- Upload bytes to storage ----------
async function uploadBytes(jobId: string, idx: number, ext: string, bytes: Uint8Array) {
  const path = `express/${jobId}/${idx}.${ext}`;
  const contentType =
    ext === "png" ? "image/png" : ext === "jpg" ? "image/jpeg" : ext === "pdf" ? "application/pdf" : "application/octet-stream";
  const { error } = await supabaseAdmin.storage.from("job-outputs").upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;
  return supabaseAdmin.storage.from("job-outputs").getPublicUrl(path).data.publicUrl;
}

// ---------- Run a single Express job ----------
export const runExpressJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projectId: z.string().uuid(),
      templateId: z.string().uuid().optional(),
      mode: z.enum(["firefly", "psd-text"]).default("firefly"),
      prompt: z.string().max(2000).optional(),
      variables: z.record(z.string(), z.string()).default({}),
      size: z.object({ width: z.number().int().min(256).max(2048), height: z.number().int().min(256).max(2048) }).optional(),
      contentClass: z.enum(["photo", "art", "graphic"]).optional(),
      numVariations: z.number().int().min(1).max(4).default(1),
      psdUrl: z.string().url().optional(),
      edits: z.array(z.object({ layerName: z.string().min(1).max(200), text: z.string().max(2000).optional(), color: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional() })).max(50).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);

    const { data: job, error: jobErr } = await supabaseAdmin
      .from("jobs")
      .insert({
        project_id: data.projectId,
        workspace_id: wsId,
        template_id: data.templateId ?? null,
        engine: "express",
        status: "running",
        brief: { express: { mode: data.mode, prompt: data.prompt ?? null } } as never,
        variables: data.variables as never,
      })
      .select("id")
      .single();
    if (jobErr) throw jobErr;
    const jobId = job.id as string;

    try {
      let outputUrls: { url: string; kind: string; meta?: any }[] = [];
      if (data.mode === "firefly") {
        const prompt = interpolate(data.prompt ?? "", data.variables);
        if (!prompt.trim()) throw new Error("A prompt is required for Firefly text-to-image.");
        const { outputs, raw } = await fireflyGenerateImages(wsId, prompt, {
          size: data.size,
          contentClass: data.contentClass,
          numVariations: (data.numVariations as 1 | 2 | 3 | 4) ?? 1,
        });
        for (let i = 0; i < outputs.length; i++) {
          const o = outputs[i];
          const dl = await fetch(o.url);
          if (!dl.ok) throw new Error(`Firefly download ${i} failed (${dl.status})`);
          const bytes = new Uint8Array(await dl.arrayBuffer());
          const pub = await uploadBytes(jobId, i, "png", bytes);
          outputUrls.push({ url: pub, kind: "png", meta: { firefly_seed: o.seed, prompt, raw_index: i } });
        }
        if (!outputUrls.length) outputUrls.push({ url: "", kind: "text", meta: { warn: "Firefly returned no images", raw } });
      } else if (data.mode === "psd-text") {
        if (!data.psdUrl) throw new Error("psdUrl is required for psd-text mode.");
        const edits = (data.edits ?? []).map((e) => ({
          ...e,
          text: e.text != null ? interpolate(e.text, data.variables) : undefined,
        }));
        const { outputs } = await psdTextReplace(wsId, { psdUrl: data.psdUrl, edits });
        for (let i = 0; i < outputs.length; i++) {
          const dl = await fetch(outputs[i].url);
          if (!dl.ok) throw new Error(`Photoshop download ${i} failed (${dl.status})`);
          const bytes = new Uint8Array(await dl.arrayBuffer());
          const pub = await uploadBytes(jobId, i, "png", bytes);
          outputUrls.push({ url: pub, kind: "png", meta: { source: "photoshop-api", index: i } });
        }
      }

      const inserted: { id: string; url: string }[] = [];
      for (const o of outputUrls) {
        const { data: row, error } = await supabaseAdmin
          .from("outputs")
          .insert({ job_id: jobId, kind: o.kind, url: o.url, metadata: { engine: "express", ...(o.meta ?? {}) } as never })
          .select("id, url").single();
        if (error) throw error;
        inserted.push(row as any);
      }

      await supabaseAdmin
        .from("jobs")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", jobId);

      return { jobId, outputs: inserted };
    } catch (e: any) {
      const msg = e instanceof ExpressNotConfiguredError ? e.message : String(e?.message ?? e);
      await supabaseAdmin
        .from("jobs")
        .update({ status: "failed", error: msg, completed_at: new Date().toISOString() })
        .eq("id", jobId);
      throw e;
    }
  });

function interpolate(s: string, vars: Record<string, string>) {
  return s.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

// ---------- Batch ----------
export const runExpressBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projectId: z.string().uuid(),
      promptTemplate: z.string().min(1).max(2000),
      rows: z.array(z.record(z.string(), z.string())).min(1).max(50),
      size: z.object({ width: z.number().int().min(256).max(2048), height: z.number().int().min(256).max(2048) }).optional(),
      contentClass: z.enum(["photo", "art", "graphic"]).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    const results: { row: number; jobId?: string; outputs?: any[]; error?: string }[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      try {
        const r: any = await (runExpressJob as any)({
          data: {
            projectId: data.projectId,
            mode: "firefly",
            prompt: data.promptTemplate,
            variables: data.rows[i],
            size: data.size,
            contentClass: data.contentClass,
            numVariations: 1,
          },
          context,
        });
        results.push({ row: i, jobId: r.jobId, outputs: r.outputs });
      } catch (e: any) {
        results.push({ row: i, error: e?.message ?? String(e) });
      }
    }
    await supabaseAdmin.from("audit_events").insert({
      workspace_id: wsId,
      actor_id: context.userId,
      action: "express.batch",
      target_type: "batch",
      target_id: null,
      summary: `Adobe Express Firefly batch: ${results.filter((r) => !r.error).length}/${results.length} succeeded`,
      metadata: { rows: data.rows.length } as never,
    });
    return { results };
  });
