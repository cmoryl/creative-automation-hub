import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listAuditEvents } from "@/lib/audit.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ClipboardCheck,
  Activity,
  Layers,
  FileEdit,
  Building2,
  Plug,
} from "lucide-react";

const ACTION_META: Record<string, { icon: typeof ShieldCheck; cls: string }> = {
  "approval.submitted": { icon: ClipboardCheck, cls: "text-info" },
  "approval.approved": { icon: ShieldCheck, cls: "text-success" },
  "approval.changes_requested": { icon: ShieldAlert, cls: "text-warning" },
  "approval.rejected": { icon: ShieldX, cls: "text-destructive" },
  "batch.dispatched": { icon: Layers, cls: "text-primary" },
  "template.updated": { icon: FileEdit, cls: "text-muted-foreground" },
  "brand.updated": { icon: Building2, cls: "text-muted-foreground" },
  "integration.connected": { icon: Plug, cls: "text-muted-foreground" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function AuditFeed({
  projectId,
  limit = 20,
  title = "Activity",
  description = "Recent governance events across the workspace.",
}: {
  projectId?: string;
  limit?: number;
  title?: string;
  description?: string;
}) {
  const fetchFn = useServerFn(listAuditEvents);
  const { data, isLoading } = useQuery({
    queryKey: ["audit-events", projectId ?? "all", limit],
    queryFn: () => fetchFn({ data: { projectId, limit } }),
    refetchInterval: 15_000,
  });

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">Loading…</p>
        ) : !data?.events.length ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {data.events.map((e) => {
              const meta = ACTION_META[e.action] ?? { icon: Activity, cls: "text-muted-foreground" };
              const Icon = meta.icon;
              return (
                <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                  <div className={`mt-0.5 rounded-md border border-border/60 bg-background/40 p-1.5 ${meta.cls}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{e.actor_name}</span>
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {e.action.replace(/\./g, " · ")}
                      </Badge>
                    </div>
                    {e.summary && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{e.summary}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(e.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
