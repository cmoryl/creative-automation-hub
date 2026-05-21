import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { randomBytes } from "crypto";

const WEBHOOK_EVENTS = ["job.completed", "job.failed", "approval.decided", "batch.dispatched"] as const;

async function getWorkspaceId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("No workspace");
  return data.workspace_id as string;
}

export const listWebhooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("workspace_webhooks")
      .select("id, name, url, events, active, last_used_at, created_at")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(1).max(80),
        url: z.string().url().max(2000),
        events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    const secret = "whsec_" + randomBytes(24).toString("base64url");
    const { data: row, error } = await context.supabase
      .from("workspace_webhooks")
      .insert({
        workspace_id: wsId,
        name: data.name,
        url: data.url,
        events: data.events,
        secret,
        created_by: context.userId,
      })
      .select("id, name, url, events, active, created_at")
      .single();
    if (error) throw error;
    return { ...row, secret };
  });

export const toggleWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workspace_webhooks")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("workspace_webhooks").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listWebhookDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ webhookId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(25) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("workspace_webhook_deliveries")
      .select("id, event, status_code, ok, error, duration_ms, created_at")
      .eq("webhook_id", data.webhookId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return rows ?? [];
  });
