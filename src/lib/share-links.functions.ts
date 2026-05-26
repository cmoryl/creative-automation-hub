import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { randomBytes } from "crypto";

function makeSlug() {
  return randomBytes(9).toString("base64url"); // 12 chars, URL-safe
}

export const createShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        kind: z.enum(["output", "batch"]),
        outputId: z.string().uuid().optional(),
        batchKey: z.string().uuid().optional(),
        expiresInDays: z.number().int().min(1).max(365).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let wsId: string | null = null;
    if (data.kind === "output") {
      if (!data.outputId) throw new Error("outputId required");
      const { data: out } = await supabase
        .from("outputs")
        .select("jobs:job_id ( workspace_id )")
        .eq("id", data.outputId)
        .maybeSingle();
      wsId = (out as { jobs?: { workspace_id?: string } | null })?.jobs?.workspace_id ?? null;
    } else {
      if (!data.batchKey) throw new Error("batchKey required");
      const { data: job } = await supabase
        .from("jobs")
        .select("workspace_id")
        .filter("brief->>batch_id", "eq", data.batchKey)
        .limit(1)
        .maybeSingle();
      wsId = job?.workspace_id ?? null;
    }
    if (!wsId) throw new Error("Target not found or not in this workspace");

    const slug = makeSlug();
    const expiresAt = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString()
      : null;

    const { data: row, error } = await supabase
      .from("share_links")
      .insert({
        workspace_id: wsId,
        slug,
        kind: data.kind,
        output_id: data.outputId ?? null,
        batch_key: data.batchKey ?? null,
        created_by: userId,
        expires_at: expiresAt,
      })
      .select("id, slug, kind, expires_at, created_at")
      .single();
    if (error) throw error;
    return { ...row, url: `/share/${slug}` };
  });

export const listShareLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        outputId: z.string().uuid().optional(),
        batchKey: z.string().uuid().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("share_links")
      .select("id, slug, kind, output_id, batch_key, expires_at, revoked_at, view_count, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.outputId) q = q.eq("output_id", data.outputId);
    if (data.batchKey) q = q.eq("batch_key", data.batchKey);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const revokeShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
