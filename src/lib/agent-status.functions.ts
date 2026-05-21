import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AgentStatusRow = {
  id: string;
  name: string;
  last_seen: string | null;
  created_at: string;
  status: {
    host: string | null;
    platform: string | null;
    agent_version: string | null;
    apps: Record<string, { installed?: boolean; version?: string }>;
    fonts_count: number;
    fonts_sample: string[];
    disk_free_mb: number | null;
    current_job_id: string | null;
    templates_seen: number;
    reported_at: string;
  } | null;
  online: boolean;
};

const ONLINE_WINDOW_MS = 60_000;

export const listAgentsWithStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AgentStatusRow[]> => {
    const { supabase } = context;
    const [pairsRes, statusRes] = await Promise.all([
      supabase
        .from("agent_pairings")
        .select("id, name, last_seen, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("agent_status")
        .select(
          "agent_id, host, platform, agent_version, apps, fonts_count, fonts_sample, disk_free_mb, current_job_id, templates_seen, reported_at",
        ),
    ]);
    if (pairsRes.error) throw pairsRes.error;
    const statusByAgent = new Map<string, NonNullable<AgentStatusRow["status"]>>();
    for (const s of statusRes.data ?? []) {
      statusByAgent.set(s.agent_id as string, {
        host: (s.host as string | null) ?? null,
        platform: (s.platform as string | null) ?? null,
        agent_version: (s.agent_version as string | null) ?? null,
        apps: (s.apps as Record<string, { installed?: boolean; version?: string }>) ?? {},
        fonts_count: (s.fonts_count as number) ?? 0,
        fonts_sample: (s.fonts_sample as string[]) ?? [],
        disk_free_mb: (s.disk_free_mb as number | null) ?? null,
        current_job_id: (s.current_job_id as string | null) ?? null,
        templates_seen: (s.templates_seen as number) ?? 0,
        reported_at: s.reported_at as string,
      });
    }
    const now = Date.now();
    return (pairsRes.data ?? []).map((p) => {
      const online = p.last_seen
        ? now - new Date(p.last_seen as string).getTime() < ONLINE_WINDOW_MS
        : false;
      return {
        id: p.id as string,
        name: p.name as string,
        last_seen: (p.last_seen as string | null) ?? null,
        created_at: p.created_at as string,
        status: statusByAgent.get(p.id as string) ?? null,
        online,
      };
    });
  });

// Lightweight engine-availability summary used by AgentBadge.
export const getAgentCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
    const [allRes, onlineRes, statusRes] = await Promise.all([
      supabase.from("agent_pairings").select("id"),
      supabase
        .from("agent_pairings")
        .select("id")
        .gte("last_seen", since),
      supabase.from("agent_status").select("agent_id, apps"),
    ]);
    const onlineIds = new Set((onlineRes.data ?? []).map((r) => r.id as string));
    const appsByAgent = new Map<string, Record<string, { installed?: boolean }>>();
    for (const s of statusRes.data ?? []) {
      appsByAgent.set(
        s.agent_id as string,
        (s.apps as Record<string, { installed?: boolean }>) ?? {},
      );
    }
    const engines = ["illustrator", "indesign"] as const;
    const coverage: Record<string, { total: number; online: number; capable: number }> = {};
    for (const eng of engines) {
      let total = 0;
      let online = 0;
      let capable = 0;
      for (const a of allRes.data ?? []) {
        const id = a.id as string;
        const apps = appsByAgent.get(id);
        const supports = apps?.[eng]?.installed === true;
        if (supports) {
          total++;
          if (onlineIds.has(id)) online++;
          capable++;
        }
      }
      coverage[eng] = { total, online, capable };
    }
    return {
      totalAgents: (allRes.data ?? []).length,
      onlineAgents: onlineIds.size,
      engines: coverage,
    };
  });
