// Server-only: fan a workspace event out to every registered webhook.
// Uses supabaseAdmin so it can run from agent routes (no user session).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHmac } from "crypto";

export type WebhookEvent =
  | "job.completed"
  | "job.failed"
  | "approval.decided"
  | "batch.dispatched";

export async function dispatchWebhook(
  workspaceId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data: hooks } = await supabaseAdmin
    .from("workspace_webhooks")
    .select("id, url, secret, events")
    .eq("workspace_id", workspaceId)
    .eq("active", true);

  if (!hooks?.length) return;

  const body = JSON.stringify({ event, payload, ts: new Date().toISOString() });

  // Fire-and-record in parallel, never block the caller longer than 8s each.
  await Promise.allSettled(
    hooks
      .filter((h) => Array.isArray(h.events) && h.events.includes(event))
      .map(async (h) => {
        const sig = createHmac("sha256", h.secret).update(body).digest("hex");
        const t0 = Date.now();
        let ok = false;
        let statusCode: number | null = null;
        let error: string | null = null;
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(h.url, {
            method: "POST",
            signal: ctrl.signal,
            headers: {
              "content-type": "application/json",
              "x-cap-signature": sig,
              "x-cap-event": event,
            },
            body,
          });
          clearTimeout(t);
          statusCode = res.status;
          ok = res.ok;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
        await supabaseAdmin.from("workspace_webhook_deliveries").insert({
          workspace_id: workspaceId,
          webhook_id: h.id,
          event,
          ok,
          status_code: statusCode,
          error,
          payload: payload as never,
          duration_ms: Date.now() - t0,
        });
        if (ok) {
          await supabaseAdmin
            .from("workspace_webhooks")
            .update({ last_used_at: new Date().toISOString() })
            .eq("id", h.id);
        }
      }),
  );
}
