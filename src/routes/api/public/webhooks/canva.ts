import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import crypto from "crypto";

// Verifies HMAC-SHA256 signature with each workspace's stored webhook secret,
// then records the event. Lightweight processing — heavy work happens in jobs.
export const Route = createFileRoute("/api/public/webhooks/canva")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature =
          request.headers.get("x-canva-signature") ??
          request.headers.get("canva-signature") ??
          "";
        const body = await request.text();

        const { data: rows } = await supabaseAdmin
          .from("workspace_integrations")
          .select("workspace_id, metadata")
          .eq("provider", "canva");

        const match = (rows ?? []).find((r: any) => {
          const secret = r.metadata?.webhook_secret;
          if (!secret) return false;
          const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
          try {
            return signature && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
          } catch {
            return false;
          }
        });

        if (!match) return new Response("Invalid signature", { status: 401 });

        let payload: any = {};
        try { payload = JSON.parse(body); } catch {}
        const eventType = payload?.type ?? payload?.event ?? "unknown";

        await supabaseAdmin.from("audit_events").insert({
          workspace_id: match.workspace_id,
          action: `canva.${eventType}`,
          target_type: "canva_webhook",
          target_id: payload?.data?.id ?? null,
          summary: `Canva webhook ${eventType}`,
          metadata: payload,
        });

        // Best-effort job finalization when an export completes
        if (eventType === "design.export.completed" || eventType === "export.completed") {
          const exportId = payload?.data?.export_id ?? payload?.data?.id;
          if (exportId) {
            // Find a running job referencing this export id
            const { data: jobs } = await supabaseAdmin
              .from("jobs")
              .select("id, brief")
              .eq("engine", "canva")
              .in("status", ["running", "queued"]);
            const target = (jobs ?? []).find(
              (j: any) => j.brief?.canva?.export_id === exportId,
            );
            if (target) {
              await supabaseAdmin
                .from("jobs")
                .update({ status: "completed", completed_at: new Date().toISOString() })
                .eq("id", target.id);
            }
          }
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
