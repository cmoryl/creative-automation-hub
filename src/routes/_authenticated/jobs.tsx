import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listAllJobs, retryJob, cancelJob } from "@/lib/agent.functions";
import { Button } from "@/components/ui/button";
import { RotateCcw, X as XIcon, ArrowRight } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/jobs")({
  component: JobsPage,
});

type Row = {
  id: string;
  engine: string;
  status: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  project_id: string;
  projects: { name: string } | null;
};

const STATUSES = ["all", "queued", "running", "completed", "failed", "cancelled"] as const;

function JobsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listAllJobs);
  const retry = useServerFn(retryJob);
  const cancel = useServerFn(cancelJob);
  const { data = [] } = useQuery<Row[]>({
    queryKey: ["all-jobs"],
    queryFn: () => list() as Promise<Row[]>,
    refetchInterval: 15000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("global-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" },
        () => qc.invalidateQueries({ queryKey: ["all-jobs"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const [filter, setFilter] = useState<typeof STATUSES[number]>("all");
  const filtered = useMemo(
    () => (filter === "all" ? data : data.filter((j) => j.status === filter)),
    [data, filter],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.length };
    data.forEach((j) => { c[j.status] = (c[j.status] ?? 0) + 1; });
    return c;
  }, [data]);

  const colour = (s: string) =>
    s === "completed" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" :
    s === "failed"    ? "bg-red-500/15 text-red-700 dark:text-red-300" :
    s === "running"   ? "bg-blue-500/15 text-blue-700 dark:text-blue-300" :
    s === "cancelled" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" :
                        "bg-muted text-muted-foreground";

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">All renders</h1>
        <p className="text-sm text-muted-foreground">Every job across this workspace · live via realtime.</p>
      </header>

      <div className="mb-4 flex flex-wrap gap-1">
        {STATUSES.map((s) => (
          <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>
            {s} <span className="ml-1.5 opacity-60">{counts[s] ?? 0}</span>
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No jobs match this filter.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((j) => (
            <li key={j.id} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${colour(j.status)}`}>{j.status}</span>
                  <span className="font-medium">{j.engine}</span>
                  <span className="text-muted-foreground">·</span>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: j.project_id }}
                    className="truncate text-muted-foreground hover:text-foreground"
                  >
                    {j.projects?.name ?? "Project"}
                  </Link>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(j.created_at).toLocaleString()}
                  {j.error && <span className="ml-2 text-red-500">· {j.error.split("\n")[0].slice(0, 80)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {(j.status === "queued" || j.status === "running") && (
                  <Button size="sm" variant="ghost"
                    onClick={async () => { try { await cancel({ data: { jobId: j.id } }); qc.invalidateQueries({ queryKey: ["all-jobs"] }); } catch (e) { toast.error(String(e)); } }}>
                    <XIcon className="h-3 w-3" />
                  </Button>
                )}
                {(j.status === "failed" || j.status === "cancelled") && (
                  <Button size="sm" variant="ghost"
                    onClick={async () => { try { await retry({ data: { jobId: j.id } }); toast.success("Re-queued"); qc.invalidateQueries({ queryKey: ["all-jobs"] }); } catch (e) { toast.error(String(e)); } }}>
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
                <Button size="sm" variant="ghost"
                  onClick={() => navigate({ to: "/projects/$projectId", params: { projectId: j.project_id } })}>
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
