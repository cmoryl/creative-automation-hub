import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// List image assets for a company / product (product narrows).
export const listProductAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        companyId: z.string().uuid().nullish(),
        productId: z.string().uuid().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!data.companyId) return { assets: [] as Array<Record<string, unknown>> };
    let q = supabase
      .from("product_assets")
      .select("id, name, url, source, prompt, product_id, company_id, created_at")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.productId) q = q.eq("product_id", data.productId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { assets: rows ?? [] };
  });

// Save a URL (already-uploaded) into the product library.
export const saveProductAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        companyId: z.string().uuid(),
        productId: z.string().uuid().nullish(),
        url: z.string().url().max(1000),
        name: z.string().min(1).max(200),
        source: z.enum(["upload", "ai"]),
        prompt: z.string().max(2000).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: company, error: cErr } = await supabase
      .from("companies")
      .select("id, workspace_id")
      .eq("id", data.companyId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!company) throw new Error("Company not found");

    const { data: row, error } = await supabase
      .from("product_assets")
      .insert({
        workspace_id: company.workspace_id,
        company_id: company.id,
        product_id: data.productId ?? null,
        kind: "image",
        name: data.name,
        url: data.url,
        source: data.source,
        prompt: data.prompt ?? null,
        created_by: userId,
      })
      .select("id, url, name, source")
      .single();
    if (error) throw error;
    return { asset: row };
  });

// Generate an image via Lovable AI Gateway and save it to the product library.
export const generateProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        prompt: z.string().min(3).max(2000),
        companyId: z.string().uuid().nullish(),
        productId: z.string().uuid().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    // Resolve workspace via company (or fall back to user's workspace)
    let workspaceId: string | null = null;
    if (data.companyId) {
      const { data: c } = await supabase
        .from("companies")
        .select("workspace_id")
        .eq("id", data.companyId)
        .maybeSingle();
      workspaceId = c?.workspace_id ?? null;
    }
    if (!workspaceId) {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_id", userId)
        .limit(1)
        .maybeSingle();
      workspaceId = ws?.id ?? null;
    }
    if (!workspaceId) throw new Error("No workspace");

    // Call Lovable AI Gateway image model
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: data.prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429)
        throw new Error("Rate limit reached. Please try again in a moment.");
      if (res.status === 402)
        throw new Error("AI credits exhausted. Add credits in workspace settings.");
      throw new Error(`Image generation failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          images?: Array<{ image_url?: { url?: string } }>;
        };
      }>;
    };
    const dataUrl =
      json.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? null;
    if (!dataUrl) throw new Error("No image returned from model");

    // dataUrl is "data:image/png;base64,...."; decode and upload to public bucket
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
    if (!m) throw new Error("Unexpected image payload");
    const mime = m[1];
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    const ext = mime.split("/")[1]?.split("+")[0] ?? "png";
    const path = `${workspaceId}/hero/ai-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("job-outputs")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("job-outputs").getPublicUrl(path);

    // Save to product library if we have a company
    let assetId: string | null = null;
    if (data.companyId) {
      const { data: saved } = await supabase
        .from("product_assets")
        .insert({
          workspace_id: workspaceId,
          company_id: data.companyId,
          product_id: data.productId ?? null,
          kind: "image",
          name: data.prompt.slice(0, 80),
          url: pub.publicUrl,
          source: "ai",
          prompt: data.prompt,
          created_by: userId,
        })
        .select("id")
        .single();
      assetId = saved?.id ?? null;
    }

    return { url: pub.publicUrl, assetId };
  });
