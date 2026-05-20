import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listBatches } from "@/lib/batch.functions";
import { Layers, ChevronRight, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/batches/")({
  component: BatchesIndexPage,
});

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  awaiting_agent: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

function BatchesIndexPage() {
  const listFn = useServerFn(listBatches);
  const { data = [], isLoading } = useQuery({
    queryKey: ["batches"],
    queryFn: () => listFn(),
    refetchInterval: 5000,
  });

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Batches</h1>
          <p className="text-sm text-muted-foreground">
            Monitor multi-row dispatches, retry failed jobs, and download bundles.
          </p>
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Layers className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No batches yet. Open any template and switch to the <strong>Batch</strong> tab
            to dispatch one.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((b) => {
            const done = b.counts.completed ?? 0;
            const failed = b.counts.failed ?? 0;
            const pct = b.total > 0 ? Math.round((done / b.total) * 100) : 0;
            return (
              <li key={b.batchId}>
                <Link
                  to="/batches/$batchId"
                  params={{ batchId: b.batchId }}
                  className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4 transition hover:border-primary hover:shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary shrink-0" />
                      <h3 className="truncate font-medium">{b.batchLabel}</h3>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(b.startedAt).toLocaleString()} ·{" "}
                      {b.engines.join(", ")} · {b.total} job(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-wrap items-center gap-1">
                      {Object.entries(b.counts).map(([s, n]) => (
                        <span
                          key={s}
                          className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_COLORS[s] ?? "bg-muted"}`}
                        >
                          {s} {n}
                        </span>
                      ))}
                    </div>
                    <div className="w-28 shrink-0">
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full ${failed > 0 ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
                        {pct}%
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
