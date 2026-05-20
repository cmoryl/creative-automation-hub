import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  getBatch,
  retryBatchFailed,
  cancelBatch,
} from "@/lib/batch.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Download,
  Loader2,
  RotateCw,
  XCircle,
  ExternalLink,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { saveAs } from "file-saver";

export const Route = createFileRoute("/_authenticated/batches/$batchId")({
  component: BatchDetailPage,
});

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  awaiting_agent: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

type Job = {
  id: string;
  status: string;
  engine: string;
  row_label: string | null;
  brief: {
    batch_label?: string;
    template_name?: string;
    progress?: { stage: string; percent: number; message?: string | null };
  } | null;
  error: string | null;
  project_id: string;
  template_id: string | null;
  created_at: string;
  completed_at: string | null;
};

function BatchDetailPage() {
  const { batchId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getBatch);
  const retryFn = useServerFn(retryBatchFailed);
  const cancelFn = useServerFn(cancelBatch);

  const { data, isLoading } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: () => getFn({ data: { batchId } }),
    refetchInterval: 4000,
  });

  const [zipping, setZipping] = useState(false);

  const jobs: Job[] = (data?.jobs ?? []) as never;
  const outputs = data?.outputs ?? [];

  // Realtime subscription
  useEffect(() => {
    if (!jobs.length) return;
    const ids = jobs.map((j) => j.id);
    const channel = supabase
      .channel(`batch-${batchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "jobs",
          filter: `id=in.(${ids.join(",")})`,
        },
        () => qc.invalidateQueries({ queryKey: ["batch", batchId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [jobs.map((j) => j.id).join(","), batchId, qc]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const j of jobs) counts[j.status] = (counts[j.status] ?? 0) + 1;
    return counts;
  }, [jobs]);

  const retry = useMutation({
    mutationFn: () => retryFn({ data: { batchId } }),
    onSuccess: (r) => {
      toast.success(`Retrying ${r.updated} job(s)`);
      qc.invalidateQueries({ queryKey: ["batch", batchId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Retry failed"),
  });

  const cancel = useMutation({
    mutationFn: () => cancelFn({ data: { batchId } }),
    onSuccess: (r) => {
      toast.success(`Cancelled ${r.cancelled} job(s)`);
      qc.invalidateQueries({ queryKey: ["batch", batchId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Cancel failed"),
  });

  const downloadAll = async () => {
    if (!outputs.length) {
      toast.error("No outputs yet");
      return;
    }
    setZipping(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      for (const o of outputs) {
        const job = jobs.find((j) => j.id === o.job_id);
        const label = (job?.row_label ?? "row").replace(/[^a-zA-Z0-9._-]+/g, "_");
        const ext = (o.url.split(".").pop() ?? o.kind ?? "bin").split("?")[0];
        let name = `${job?.engine ?? "out"}/${label}.${ext}`;
        let i = 1;
        while (usedNames.has(name)) {
          name = `${job?.engine ?? "out"}/${label}-${i++}.${ext}`;
        }
        usedNames.add(name);
        try {
          const res = await fetch(o.url);
          if (!res.ok) throw new Error(`${res.status}`);
          const blob = await res.blob();
          zip.file(name, blob);
        } catch {
          // skip unreachable
        }
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const safe = (jobs[0]?.brief?.batch_label ?? "batch").replace(
        /[^a-zA-Z0-9._-]+/g,
        "_",
      );
      saveAs(blob, `${safe}-${batchId.slice(0, 8)}.zip`);
      toast.success(`Zipped ${outputs.length} file(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Zip failed");
    } finally {
      setZipping(false);
    }
  };

  const total = jobs.length;
  const done = stats.completed ?? 0;
  const failed = stats.failed ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const batchLabel = jobs[0]?.brief?.batch_label ?? "Batch";

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 -ml-2"
        onClick={() => navigate({ to: "/batches" })}
      >
        <ArrowLeft className="h-4 w-4" /> Back to batches
      </Button>

      {isLoading && !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !jobs.length ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No jobs found for this batch.
        </div>
      ) : (
        <>
          <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-bold">{batchLabel}</h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {total} job(s) · {outputs.length} output(s) · started{" "}
                {new Date(jobs[0].created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={zipping || !outputs.length}
                onClick={downloadAll}
              >
                {zipping ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}{" "}
                Download ZIP ({outputs.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={retry.isPending || !(failed > 0)}
                onClick={() => retry.mutate()}
              >
                {retry.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCw className="h-4 w-4" />
                )}{" "}
                Retry failed ({failed})
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  cancel.isPending ||
                  !((stats.queued ?? 0) + (stats.running ?? 0))
                }
                onClick={() => cancel.mutate()}
              >
                {cancel.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}{" "}
                Cancel active
              </Button>
            </div>
          </header>

          <div className="mb-6 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {Object.entries(stats).map(([s, n]) => (
                <span
                  key={s}
                  className={`rounded px-2 py-0.5 ${STATUS_COLORS[s] ?? "bg-muted"}`}
                >
                  {s} {n}
                </span>
              ))}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${failed > 0 ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-right text-xs text-muted-foreground">
              {done} / {total} complete · {pct}%
            </div>
          </div>

          <ul className="space-y-1.5">
            {jobs.map((j) => {
              const jobOutputs = outputs.filter((o) => o.job_id === j.id);
              return (
                <li
                  key={j.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${STATUS_COLORS[j.status] ?? "bg-muted"}`}
                      >
                        {j.status}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {j.engine}
                      </span>
                      <span className="truncate font-medium">
                        {j.row_label ?? "—"}
                      </span>
                      {j.brief?.template_name && (
                        <span className="truncate text-xs text-muted-foreground">
                          · {j.brief.template_name}
                        </span>
                      )}
                    </div>
                    {j.brief?.progress && j.status !== "completed" && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {j.brief.progress.stage} {j.brief.progress.percent}%
                        {j.brief.progress.message
                          ? ` — ${j.brief.progress.message}`
                          : ""}
                      </p>
                    )}
                    {j.error && (
                      <p className="mt-0.5 text-xs text-destructive">{j.error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {jobOutputs.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {jobOutputs.length} file(s)
                      </span>
                    )}
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: j.project_id }}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
