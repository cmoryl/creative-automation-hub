import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listBatchSchedules, cancelBatchSchedule } from "@/lib/batch-schedules.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/schedules")({
  component: SchedulesPage,
});

function SchedulesPage() {
  const listFn = useServerFn(listBatchSchedules);
  const cancelFn = useServerFn(cancelBatchSchedule);
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["schedules"], queryFn: () => listFn() });
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CalendarClock className="h-5 w-5 text-primary" /> Scheduled batches
        </h1>
        <p className="text-sm text-muted-foreground">
          Batches queued for a future dispatch time. Create one from the batch dispatch screen by
          choosing "Schedule" instead of "Dispatch now". A background runner picks up due jobs every minute.
        </p>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No scheduled batches.
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((s) => {
            const statusColor =
              s.status === "pending" ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
              : s.status === "dispatched" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
              : s.status === "failed" ? "bg-destructive/15 text-destructive border-destructive/30"
              : "bg-muted text-muted-foreground";
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{s.name}</span>
                    <Badge variant="outline" className={statusColor}>{s.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Runs {new Date(s.run_at).toLocaleString()}
                    {s.dispatched_at && ` · dispatched ${new Date(s.dispatched_at).toLocaleString()}`}
                  </p>
                  {s.error && <p className="text-xs text-destructive">{s.error}</p>}
                </div>
                {s.status === "pending" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={busy === s.id}
                    onClick={async () => {
                      setBusy(s.id);
                      try { await cancelFn({ data: { id: s.id } }); qc.invalidateQueries({ queryKey: ["schedules"] }); toast.success("Cancelled"); }
                      catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                      finally { setBusy(null); }
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
