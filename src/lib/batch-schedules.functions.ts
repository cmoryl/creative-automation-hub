import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PayloadSchema = z.object({
  batchLabel: z.string().min(1).max(200),
  briefSummary: z.string().max(2000).optional(),
  groups: z
    .array(
      z.object({
        templateId: z.string().uuid(),
        engines: z.array(z.string()).min(1).max(5),
        rows: z
          .array(z.object({ label: z.string().min(1).max(200), values: z.record(z.string(), z.string()) }))
          .min(1)
          .max(100),
      }),
    )
    .min(1)
    .max(20),
});

async function getWorkspaceId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("No workspace");
  return data.workspace_id as string;
}

export const createBatchSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(1).max(200),
        runAt: z.string().datetime(),
        payload: PayloadSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    if (new Date(data.runAt).getTime() < Date.now() - 60_000) {
      throw new Error("runAt must be in the future");
    }
    const { data: row, error } = await context.supabase
      .from("batch_schedules")
      .insert({
        workspace_id: wsId,
        name: data.name,
        run_at: data.runAt,
        payload: data.payload as never,
        created_by: context.userId,
      })
      .select("id, name, run_at, status, created_at")
      .single();
    if (error) throw error;
    return row;
  });

export const listBatchSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await getWorkspaceId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("batch_schedules")
      .select("id, name, run_at, status, dispatched_at, error, created_at")
      .eq("workspace_id", wsId)
      .order("run_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const cancelBatchSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("batch_schedules")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw error;
    return { ok: true };
  });
