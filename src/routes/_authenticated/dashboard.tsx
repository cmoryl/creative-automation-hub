import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getDashboardStatus } from "@/lib/dashboard.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Plug,
  Cpu,
  Clock,
  RefreshCw,
  Layers,
  FileStack,
  Wifi,
  WifiOff,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const engineLabels: Record<string, string> = {
  illustrator: "Adobe Illustrator",
  indesign: "Adobe InDesign",
  figma: "Figma",
  canva: "Canva",
};

const statusStyles: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  healthy: { label: "Healthy", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
  degraded: { label: "Degraded", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: AlertTriangle },
  down: { label: "Offline", cls: "bg-destructive/15 text-destructive border-destructive/30", icon: XCircle },
  idle: { label: "Idle", cls: "bg-muted text-muted-foreground border-border", icon: Clock },
};

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function DashboardPage() {
  const fetchStatus = useServerFn(getDashboardStatus);
  const qc = useQueryClient();
  const [tick, setTick] = useState(0);

  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["dashboard-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });

  // Force re-render every second to keep "x seconds ago" labels live
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Realtime: whenever any job changes, refetch dashboard
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard-status"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_pairings" }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard-status"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const lastUpdated = useMemo(() => (dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null), [dataUpdatedAt, tick]);

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Activity className="h-6 w-6 text-primary" />
            Live Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time status of render engines, local bridge agents, and recent job activity.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${isFetching ? "bg-primary animate-pulse" : "bg-emerald-500"}`} />
            {isFetching ? "Refreshing…" : `Updated ${timeAgo(lastUpdated)}`}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ["dashboard-status"] })}
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
      </header>

      {isLoading || !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard…
        </div>
      ) : (
        <>
          {/* Totals row */}
          <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Total Jobs" value={data.totals.jobs} icon={Layers} />
            <StatCard label="Running" value={data.totals.running} icon={Loader2} accent="text-blue-500" spin={data.totals.running > 0} />
            <StatCard label="Queued" value={data.totals.queued} icon={Clock} accent="text-amber-500" />
            <StatCard label="Failed" value={data.totals.failed} icon={XCircle} accent="text-destructive" />
            <StatCard label="Outputs" value={data.totals.outputs} icon={FileStack} accent="text-emerald-500" />
          </section>

          {/* Engines */}
          <section className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Cpu className="h-4 w-4" /> Render Engines
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {data.engines.map((e) => {
                const meta = statusStyles[e.status];
                const Icon = meta.icon;
                return (
                  <Card key={e.engine} className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{engineLabels[e.engine] ?? e.engine}</CardTitle>
                          <CardDescription className="mt-1 text-xs">
                            {e.needsBridge ? "Local bridge required" : "Cloud-native"}
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className={`${meta.cls} gap-1`}>
                          <Icon className={`h-3 w-3 ${e.status === "down" ? "" : ""}`} />
                          {meta.label}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {e.needsBridge && (
                        <div className="flex items-center gap-2 text-xs">
                          {e.hasLiveAgent ? (
                            <>
                              <Wifi className="h-3 w-3 text-emerald-500" />
                              <span className="text-emerald-600">Bridge agent online</span>
                            </>
                          ) : (
                            <>
                              <WifiOff className="h-3 w-3 text-destructive" />
                              <span className="text-destructive">No live agent</span>
                            </>
                          )}
                        </div>
                      )}
                      <div className="grid grid-cols-4 gap-2 text-center text-xs">
                        <Stat n={e.completed} label="Done" />
                        <Stat n={e.running} label="Run" accent="text-blue-500" />
                        <Stat n={e.queued} label="Queue" accent="text-amber-500" />
                        <Stat n={e.failed} label="Fail" accent="text-destructive" />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span>Success rate</span>
                          <span>{e.successRate !== null ? `${e.successRate.toFixed(0)}%` : "—"}</span>
                        </div>
                        <Progress value={e.successRate ?? 0} className="h-1.5" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {e.templateCount} template{e.templateCount === 1 ? "" : "s"}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Agents + Integrations */}
          <section className="mb-8 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Plug className="h-4 w-4" /> Local Bridge Agents
                </CardTitle>
                <CardDescription>Adobe app runners polling this workspace.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.agents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No agents paired. <Link to="/settings/agent" className="text-primary underline">Pair one</Link> to run Illustrator/InDesign jobs.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {data.agents.map((a) => (
                      <li key={a.id} className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${a.online ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
                          <span className="text-sm font-medium">{a.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {a.online ? "Online" : `Seen ${timeAgo(a.lastSeen)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Plug className="h-4 w-4" /> Integrations
                </CardTitle>
                <CardDescription>Connected external services.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.integrations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No integrations yet. <Link to="/settings/integrations" className="text-primary underline">Connect one</Link>.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {data.integrations.map((i) => (
                      <li key={i.provider} className="flex items-center justify-between py-2">
                        <span className="text-sm font-medium capitalize">{i.provider}</span>
                        <span className="text-xs text-muted-foreground">Updated {timeAgo(i.updatedAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Recent jobs */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Activity className="h-4 w-4" /> Recent Activity (24h)
            </h2>
            <Card>
              <CardContent className="p-0">
                {data.recentJobs.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No jobs in the last 24 hours.</p>
                ) : (
                  <ul className="divide-y">
                    {data.recentJobs.map((j) => {
                      const brief = (j.brief ?? {}) as { progress?: { stage?: string; percent?: number; message?: string } };
                      const progress = brief.progress;
                      const SIcon =
                        j.status === "completed" ? CheckCircle2 :
                        j.status === "failed" ? XCircle :
                        j.status === "running" ? Loader2 : Clock;
                      const sColor =
                        j.status === "completed" ? "text-emerald-500" :
                        j.status === "failed" ? "text-destructive" :
                        j.status === "running" ? "text-blue-500" : "text-amber-500";
                      return (
                        <li key={j.id} className="flex items-center gap-4 px-4 py-3">
                          <SIcon className={`h-4 w-4 shrink-0 ${sColor} ${j.status === "running" ? "animate-spin" : ""}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{j.engine}</Badge>
                              <span className="text-xs font-medium capitalize">{j.status}</span>
                              {progress?.stage && (
                                <span className="text-xs text-muted-foreground">· {progress.stage}</span>
                              )}
                            </div>
                            {progress?.message && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">{progress.message}</p>
                            )}
                            {j.error && (
                              <p className="mt-0.5 truncate text-xs text-destructive">{j.error}</p>
                            )}
                          </div>
                          {typeof progress?.percent === "number" && j.status !== "completed" && (
                            <div className="hidden w-24 sm:block">
                              <Progress value={progress.percent} className="h-1.5" />
                            </div>
                          )}
                          <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(j.created_at)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  spin,
}: {
  label: string;
  value: number;
  icon: typeof CheckCircle2;
  accent?: string;
  spin?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
        </div>
        <Icon className={`h-6 w-6 ${accent ?? "text-muted-foreground"} ${spin ? "animate-spin" : ""}`} />
      </CardContent>
    </Card>
  );
}

function Stat({ n, label, accent }: { n: number; label: string; accent?: string }) {
  return (
    <div className="rounded border bg-muted/30 py-1.5">
      <div className={`text-sm font-bold tabular-nums ${accent ?? ""}`}>{n}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}
