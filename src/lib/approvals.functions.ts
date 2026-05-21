import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const STATUSES = ["pending", "approved", "changes_requested", "rejected"] as const;

async function writeAudit(
  supabase: any,
  workspaceId: string,
  actorId: string,
  action: string,
  targetId: string,
  projectId: string | null,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  await supabase.from("audit_events").insert({
    workspace_id: workspaceId,
    actor_id: actorId,
    action,
    target_type: "approval",
    target_id: targetId,
    project_id: projectId,
    summary,
    metadata: metadata as never,
  });
}

export const submitBatchForApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        batchId: z.string().uuid(),
        title: z.string().min(1).max(200),
        notes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: sample, error: sampleErr } = await supabase
      .from("jobs")
      .select("workspace_id, project_id")
      .filter("brief->>batch_id", "eq", data.batchId)
      .limit(1)
      .maybeSingle();
    if (sampleErr) throw sampleErr;
    if (!sample) throw new Error("Batch not found");

    const { data: existing } = await supabase
      .from("batch_approvals")
      .select("id, status")
      .eq("batch_key", data.batchId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let approvalId: string;
    if (existing && existing.status === "pending") {
      approvalId = existing.id;
    } else {
      const { data: created, error: createErr } = await supabase
        .from("batch_approvals")
        .insert({
          workspace_id: sample.workspace_id,
          project_id: sample.project_id,
          batch_key: data.batchId,
          title: data.title,
          status: "pending",
          submitted_by: userId,
          metadata: { notes: data.notes ?? "" } as never,
        })
        .select("id")
        .single();
      if (createErr) throw createErr;
      approvalId = created.id;
    }

    await supabase
      .from("jobs")
      .update({
        submitted_for_approval_at: new Date().toISOString(),
        approval_id: approvalId,
      })
      .filter("brief->>batch_id", "eq", data.batchId);

    await writeAudit(
      supabase,
      sample.workspace_id,
      userId,
      "approval.submitted",
      approvalId,
      sample.project_id,
      `Submitted "${data.title}" for review`,
      { batchId: data.batchId },
    );

    return { approvalId };
  });

export const decideApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        approvalId: z.string().uuid(),
        decision: z.enum(["approved", "changes_requested", "rejected"]),
        reviewerNotes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: appr, error } = await supabase
      .from("batch_approvals")
      .update({
        status: data.decision,
        reviewer_id: userId,
        reviewer_notes: data.reviewerNotes ?? null,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.approvalId)
      .select("workspace_id, project_id, batch_key, title")
      .single();
    if (error) throw error;

    await writeAudit(
      supabase,
      appr.workspace_id,
      userId,
      `approval.${data.decision}`,
      data.approvalId,
      appr.project_id,
      `${data.decision === "approved" ? "Approved" : data.decision === "rejected" ? "Rejected" : "Requested changes on"} "${appr.title}"`,
      { batchId: appr.batch_key, notes: data.reviewerNotes ?? "" },
    );

    return { ok: true };
  });

export const listApprovals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        status: z.enum(STATUSES).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("batch_approvals")
      .select(
        "id, batch_key, title, status, submitted_by, reviewer_id, reviewer_notes, metadata, created_at, decided_at, project_id, workspace_id",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;

    const userIds = Array.from(
      new Set(
        (rows ?? []).flatMap((r) => [r.submitted_by, r.reviewer_id]).filter(Boolean),
      ),
    ) as string[];
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
      : { data: [] };
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

    return {
      approvals: (rows ?? []).map((r) => ({
        ...r,
        submitter_name: nameById.get(r.submitted_by) ?? "Member",
        reviewer_name: r.reviewer_id ? nameById.get(r.reviewer_id) ?? "Member" : null,
      })),
    };
  });

export const getApprovalForBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ batchId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("batch_approvals")
      .select(
        "id, batch_key, title, status, submitted_by, reviewer_id, reviewer_notes, metadata, created_at, decided_at",
      )
      .eq("batch_key", data.batchId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!row) return { approval: null };

    const userIds = [row.submitted_by, row.reviewer_id].filter(Boolean) as string[];
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
      : { data: [] };
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

    return {
      approval: {
        ...row,
        submitter_name: nameById.get(row.submitted_by) ?? "Member",
        reviewer_name: row.reviewer_id ? nameById.get(row.reviewer_id) ?? "Member" : null,
      },
    };
  });
