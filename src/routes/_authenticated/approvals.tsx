import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listApprovals } from "@/lib/approvals.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, ShieldCheck, ShieldAlert, ShieldX, Loader2, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/approvals")({
  component: ApprovalsPage,
});

const STATUS_META: Record<string, { label: string; cls: string; icon: typeof ShieldCheck }> = {
  pending: { label: "Awaiting review", cls: "border-warning/40 text-warning bg-warning/10", icon: ClipboardCheck },
  approved: { label: "Approved", cls: "border-success/40 text-success bg-success/10", icon: ShieldCheck },
  changes_requested: { label: "Changes requested", cls: "border-info/40 text-info bg-info/10", icon: ShieldAlert },
  rejected: { label: "Rejected", cls: "border-destructive/40 text-destructive bg-destructive/10", icon: ShieldX },
};

const FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "changes_requested", label: "Changes" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
] as const;

function ApprovalsPage() {
  const fetchFn = useServerFn(listApprovals);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("pending");

  const { data, isLoading } = useQuery({
    queryKey: ["approvals", filter],
    queryFn: () =>
      fetchFn({
        data:
          filter === "all"
            ? {}
            : { status: filter as "pending" | "approved" | "changes_requested" | "rejected" },
      }),
    refetchInterval: 10_000,
  });

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ClipboardCheck className="h-6 w-6 text-primary" />
          Approvals
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review and sign off on batches before they ship. Every decision is recorded in the audit log.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
            className={filter === f.key ? "bg-gradient-to-r from-primary to-[var(--primary-glow)]" : ""}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading approvals…
        </div>
      ) : !data?.approvals.length ? (
        <Card className="border-dashed bg-card/40">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No approvals match this filter.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {data.approvals.map((a) => {
            const meta = STATUS_META[a.status];
            const Icon = meta.icon;
            return (
              <li key={a.id}>
                <Link
                  to="/batches/$batchId"
                  params={{ batchId: a.batch_key }}
                  className="group flex items-center gap-4 rounded-lg border border-border/60 bg-card/60 px-5 py-4 backdrop-blur transition hover:border-primary/40 hover:shadow-[var(--shadow-elevated)]"
                >
                  <div className="rounded-md border border-border/60 bg-background/40 p-2">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-medium">{a.title}</h3>
                      <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Submitted by {a.submitter_name} · {new Date(a.created_at).toLocaleString()}
                      {a.reviewer_name ? ` · Reviewed by ${a.reviewer_name}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
