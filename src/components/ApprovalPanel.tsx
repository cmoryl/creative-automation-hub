import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getApprovalForBatch,
  submitBatchForApproval,
  decideApproval,
} from "@/lib/approvals.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, ShieldX, ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Awaiting review", cls: "border-warning/40 text-warning bg-warning/10" },
  approved: { label: "Approved", cls: "border-success/40 text-success bg-success/10" },
  changes_requested: { label: "Changes requested", cls: "border-info/40 text-info bg-info/10" },
  rejected: { label: "Rejected", cls: "border-destructive/40 text-destructive bg-destructive/10" },
};

export function ApprovalPanel({
  batchId,
  defaultTitle,
}: {
  batchId: string;
  defaultTitle: string;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getApprovalForBatch);
  const submitFn = useServerFn(submitBatchForApproval);
  const decideFn = useServerFn(decideApproval);

  const { data, isLoading } = useQuery({
    queryKey: ["approval", batchId],
    queryFn: () => getFn({ data: { batchId } }),
    refetchInterval: 8000,
  });

  const [notes, setNotes] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      submitFn({ data: { batchId, title: defaultTitle, notes: notes || undefined } }),
    onSuccess: () => {
      toast.success("Submitted for review");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["approval", batchId] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["audit-events"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Submit failed"),
  });

  const decide = useMutation({
    mutationFn: (decision: "approved" | "changes_requested" | "rejected") =>
      decideFn({
        data: {
          approvalId: data!.approval!.id,
          decision,
          reviewerNotes: reviewNotes || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Decision recorded");
      setReviewNotes("");
      qc.invalidateQueries({ queryKey: ["approval", batchId] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["audit-events"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Decision failed"),
  });

  const approval = data?.approval;
  const statusMeta = approval ? STATUS_META[approval.status] : null;

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4 text-primary" /> Approval workflow
            </CardTitle>
            <CardDescription>Reviewer sign-off with full audit trail.</CardDescription>
          </div>
          {statusMeta && (
            <Badge variant="outline" className={`${statusMeta.cls} gap-1`}>
              {statusMeta.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !approval ? (
          <>
            <p className="text-sm text-muted-foreground">
              This batch has not been submitted for review yet.
            </p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes for the reviewer (optional)…"
              rows={3}
            />
            <Button
              size="sm"
              onClick={() => submit.mutate()}
              disabled={submit.isPending}
              className="bg-gradient-to-r from-primary to-[var(--primary-glow)] shadow-[var(--shadow-glow)]"
            >
              {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              Submit for approval
            </Button>
          </>
        ) : (
          <>
            <div className="grid gap-2 text-xs text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">Submitted by</span>{" "}
                {approval.submitter_name} · {new Date(approval.created_at).toLocaleString()}
              </div>
              {approval.reviewer_name && (
                <div>
                  <span className="font-medium text-foreground">Reviewed by</span>{" "}
                  {approval.reviewer_name}
                  {approval.decided_at ? ` · ${new Date(approval.decided_at).toLocaleString()}` : ""}
                </div>
              )}
              {approval.reviewer_notes && (
                <div className="rounded-md border border-border/60 bg-background/40 p-3 text-foreground">
                  {approval.reviewer_notes}
                </div>
              )}
            </div>

            {approval.status === "pending" && (
              <div className="space-y-2 border-t border-border/40 pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Reviewer decision
                </p>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Reviewer notes (visible in audit log)…"
                  rows={3}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => decide.mutate("approved")}
                    disabled={decide.isPending}
                    className="bg-[var(--success)] text-background hover:opacity-90"
                  >
                    <ShieldCheck className="h-4 w-4" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => decide.mutate("changes_requested")}
                    disabled={decide.isPending}
                    className="border-info/40 text-info hover:bg-info/10"
                  >
                    <ShieldAlert className="h-4 w-4" /> Request changes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => decide.mutate("rejected")}
                    disabled={decide.isPending}
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    <ShieldX className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
