import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TARGET_TYPES = [
  "batch",
  "approval",
  "job",
  "template",
  "brand",
  "project",
  "member",
  "integration",
] as const;

export const logAuditEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        action: z.string().min(1).max(80),
        targetType: z.enum(TARGET_TYPES),
        targetId: z.string().max(200).optional(),
        projectId: z.string().uuid().optional(),
        summary: z.string().max(500).optional(),
        metadata: z.record(z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("audit_events").insert({
      workspace_id: data.workspaceId,
      actor_id: userId,
      action: data.action,
      target_type: data.targetType,
      target_id: data.targetId ?? null,
      project_id: data.projectId ?? null,
      summary: data.summary ?? null,
      metadata: (data.metadata ?? {}) as never,
    });
    if (error) throw error;
    return { ok: true };
  });

export const listAuditEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        targetType: z.enum(TARGET_TYPES).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let workspaceId = data.workspaceId;
    if (!workspaceId) {
      const { data: m } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      workspaceId = m?.workspace_id ?? undefined;
    }
    if (!workspaceId) return { events: [] as never[] };

    let q = supabase
      .from("audit_events")
      .select("id, action, target_type, target_id, project_id, summary, metadata, created_at, actor_id")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.projectId) q = q.eq("project_id", data.projectId);
    if (data.targetType) q = q.eq("target_type", data.targetType);

    const { data: events, error } = await q;
    if (error) throw error;

    const actorIds = Array.from(
      new Set((events ?? []).map((e) => e.actor_id).filter(Boolean)),
    ) as string[];
    const { data: profiles } = actorIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", actorIds)
      : { data: [] };
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

    return {
      events: (events ?? []).map((e) => ({
        ...e,
        actor_name: e.actor_id ? nameById.get(e.actor_id) ?? "Member" : "System",
      })),
    };
  });
