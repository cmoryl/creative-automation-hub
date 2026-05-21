import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dispatchBatchCore } from "@/lib/batch-core.server";

// Runs scheduled batches whose run_at <= now and dispatches them.
// Called by pg_cron every minute.
export const Route = createFileRoute("/api/public/hooks/run-schedules")({
  server: {
    handlers: {
      POST: async () => {
        const nowIso = new Date().toISOString();
        const { data: due, error } = await supabaseAdmin
          .from("batch_schedules")
          .select("id, name, payload, created_by, workspace_id")
          .eq("status", "pending")
          .lte("run_at", nowIso)
          .order("run_at", { ascending: true })
          .limit(20);

        if (error) {
          return new Response(
            JSON.stringify({ ok: false, error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const results: { id: string; ok: boolean; error?: string }[] = [];

        for (const s of due ?? []) {
          // Mark as running to avoid double dispatch
          const { data: claimed } = await supabaseAdmin
            .from("batch_schedules")
            .update({ status: "running" })
            .eq("id", s.id)
            .eq("status", "pending")
            .select("id")
            .maybeSingle();
          if (!claimed) continue;

          try {
            await dispatchBatchCore(
              supabaseAdmin,
              s.created_by,
              s.payload as never,
            );
            await supabaseAdmin
              .from("batch_schedules")
              .update({
                status: "dispatched",
                dispatched_at: new Date().toISOString(),
              })
              .eq("id", s.id);
            results.push({ id: s.id, ok: true });
          } catch (e: any) {
            await supabaseAdmin
              .from("batch_schedules")
              .update({
                status: "failed",
                error: e?.message ?? "dispatch failed",
              })
              .eq("id", s.id);
            results.push({ id: s.id, ok: false, error: e?.message });
          }
        }

        return new Response(
          JSON.stringify({ ok: true, processed: results.length, results }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
