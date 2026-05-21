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
      fileUrl: z.string().url().max(500).optional(),
      kind: z.string().max(50).optional(),
      id: z.string().max(200).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    // Stub: real implementation would clone the Figma frame as a template row.
    return { ok: false as const, error: "Figma import not yet implemented. Use renderFigmaNode for render-only.", input: data };
  });
