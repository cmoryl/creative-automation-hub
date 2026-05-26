import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  parseFigmaUrl,
  renderNode,
  getFileTopLevel,
  getNodeDetail,
  extractVariables,
  type FigmaImageFormat,
} from "./figma.server";


export const inspectFigmaFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ url: z.string().url().max(500) }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { fileKey, nodeId } = parseFigmaUrl(data.url);
      const file = await getFileTopLevel(fileKey, 2);
      return {
        ok: true as const,
        file_key: fileKey,
        node_id: nodeId,
        name: file.name,
        last_modified: file.lastModified,
        top_level: file.document.children ?? [],
      };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      return {
        ok: false as const,
        error: msg,
        needs_secret: /FIGMA_PAT is not configured/i.test(msg),
      };
    }
  });

export const renderFigmaNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      url: z.string().url().max(500),
      format: z.enum(["png", "jpg", "svg", "pdf"]).default("png"),
      scale: z.number().min(0.5).max(4).default(2),
      nodeIds: z.array(z.string().min(1).max(100)).max(20).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { fileKey, nodeId } = parseFigmaUrl(data.url);
      const targets = data.nodeIds?.length
        ? data.nodeIds
        : nodeId
          ? [nodeId]
          : null;
      if (!targets) {
        return { ok: false as const, error: "No node-id in URL and no nodeIds provided." };
      }
      const images = await renderNode({
        fileKey,
        nodeIds: targets,
        format: data.format as FigmaImageFormat,
        scale: data.scale,
      });
      return { ok: true as const, file_key: fileKey, images };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      return {
        ok: false as const,
        error: msg,
        needs_secret: /FIGMA_PAT is not configured/i.test(msg),
      };
    }
  });

// ---- Legacy/back-compat exports (token storage + template import) ----

export const saveFigmaToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ token: z.string().min(10).max(500) }).parse(input))
  .handler(async ({ data }) => {
    // PAT storage TBD (no `integrations` table yet). For now the PAT must be
    // set as the FIGMA_PAT project secret; this stub exists only to keep the
    // settings/templates UI compiling.
    if (!data.token) return { ok: false as const, error: "no token", handle: undefined as string | undefined };
    return { ok: true as const, handle: undefined as string | undefined };
  });


export const importFigmaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      fileUrl: z.string().url().max(500),
      name: z.string().max(200).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    try {
      const { fileKey, nodeId } = parseFigmaUrl(data.fileUrl);

      // Resolve workspace
      const { data: ws, error: wsErr } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_id", userId)
        .limit(1)
        .maybeSingle();
      if (wsErr) throw wsErr;
      if (!ws) throw new Error("No workspace found for current user");

      // Resolve target node
      const file = await getFileTopLevel(fileKey, 2);
      let targetId = nodeId;
      let targetName = file.name;
      if (!targetId) {
        const firstPage = file.document.children?.[0];
        const firstFrame = firstPage?.children?.find((c) => c.type === "FRAME" || c.type === "COMPONENT");
        if (!firstFrame) throw new Error("No frame found in the Figma file. Pick a node-id explicitly.");
        targetId = firstFrame.id;
        targetName = firstFrame.name;
      }

      // Render preview thumbnail
      let previewUrl: string | null = null;
      try {
        const imgs = await renderNode({ fileKey, nodeIds: [targetId], format: "png", scale: 2 });
        previewUrl = imgs[targetId] ?? null;
      } catch (_e) {
        // non-fatal — template can still be created without preview
      }

      // Extract variables from the node subtree
      const node = await getNodeDetail(fileKey, targetId);
      const variables = node ? extractVariables(node) : [];

      const templateName = data.name?.trim() || targetName || `Figma — ${file.name}`;
      const { data: tpl, error: insErr } = await supabase
        .from("templates")
        .insert({
          workspace_id: ws.id,
          engine: "figma",
          name: templateName,
          source_ref: data.fileUrl,
          preview_url: previewUrl,
          variables: variables as never,
        })
        .select("id, name")
        .single();
      if (insErr) throw insErr;

      return {
        ok: true as const,
        template: tpl,
        variables_count: variables.length,
        node_id: targetId,
      };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      return {
        ok: false as const,
        error: msg,
        needs_secret: /FIGMA_PAT is not configured/i.test(msg),
      };
    }
  });
