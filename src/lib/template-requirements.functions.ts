import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type TemplateRequirements = {
  fonts?: { family: string; style?: string }[];
  links?: { name: string; sha?: string }[];
  notes?: string;
};

const RequirementsSchema = z.object({
  fonts: z
    .array(z.object({ family: z.string().min(1).max(200), style: z.string().max(80).optional() }))
    .max(200)
    .optional(),
  links: z
    .array(z.object({ name: z.string().min(1).max(400), sha: z.string().max(120).optional() }))
    .max(500)
    .optional(),
  notes: z.string().max(2000).optional(),
});

export const setTemplateRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        templateId: z.string().uuid(),
        requirements: RequirementsSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("templates")
      .update({ requirements: data.requirements as never })
      .eq("id", data.templateId);
    if (error) throw error;
    return { ok: true };
  });

export type TemplateAvailabilityRow = {
  template_id: string;
  agent_id: string;
  agent_name: string;
  agent_online: boolean;
  file_present: boolean;
  fonts_missing: string[];
  links_missing: string[];
  checked_at: string;
};

export const getTemplateAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ templateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<TemplateAvailabilityRow[]> => {
    const { supabase } = context;
    const [availRes, agentsRes] = await Promise.all([
      supabase
        .from("template_agent_availability")
        .select("template_id, agent_id, file_present, fonts_missing, links_missing, checked_at")
        .eq("template_id", data.templateId),
      supabase.from("agent_pairings").select("id, name, last_seen"),
    ]);
    if (availRes.error) throw availRes.error;
    const now = Date.now();
    const agents = new Map(
      (agentsRes.data ?? []).map((a) => [
        a.id as string,
        {
          name: a.name as string,
          online: a.last_seen ? now - new Date(a.last_seen as string).getTime() < 60_000 : false,
        },
      ]),
    );
    return (availRes.data ?? []).map((r) => {
      const meta = agents.get(r.agent_id as string);
      return {
        template_id: r.template_id as string,
        agent_id: r.agent_id as string,
        agent_name: meta?.name ?? "Unknown agent",
        agent_online: meta?.online ?? false,
        file_present: r.file_present as boolean,
        fonts_missing: (r.fonts_missing as string[]) ?? [],
        links_missing: (r.links_missing as string[]) ?? [],
        checked_at: r.checked_at as string,
      };
    });
  });

// Compact availability summary for every template in the workspace.
// Returns one row per template with worst-case fonts/links across agents.
export type TemplateAvailabilitySummary = {
  template_id: string;
  status: "ok" | "warn" | "fail" | "unknown";
  agents_with_file: number;
  agents_total: number;
  fonts_missing_any: string[];
  links_missing_any: string[];
};

export const getAllTemplateAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TemplateAvailabilitySummary[]> => {
    const { supabase } = context;
    const since = new Date(Date.now() - 60_000).toISOString();
    const [availRes, onlineRes] = await Promise.all([
      supabase
        .from("template_agent_availability")
        .select("template_id, agent_id, file_present, fonts_missing, links_missing"),
      supabase
        .from("agent_pairings")
        .select("id")
        .gte("last_seen", since),
    ]);
    if (availRes.error) throw availRes.error;
    const onlineAgents = new Set((onlineRes.data ?? []).map((r) => r.id as string));

    const byTemplate = new Map<
      string,
      {
        present: Set<string>;
        seen: Set<string>;
        fonts: Set<string>;
        links: Set<string>;
      }
    >();
    for (const r of availRes.data ?? []) {
      const id = r.template_id as string;
      const agentId = r.agent_id as string;
      if (!byTemplate.has(id))
        byTemplate.set(id, { present: new Set(), seen: new Set(), fonts: new Set(), links: new Set() });
      const e = byTemplate.get(id)!;
      e.seen.add(agentId);
      if (r.file_present) e.present.add(agentId);
      for (const f of (r.fonts_missing as string[]) ?? []) e.fonts.add(f);
      for (const l of (r.links_missing as string[]) ?? []) e.links.add(l);
    }
    const out: TemplateAvailabilitySummary[] = [];
    for (const [tid, e] of byTemplate.entries()) {
      const onlinePresent = Array.from(e.present).filter((a) => onlineAgents.has(a)).length;
      const onlineSeen = Array.from(e.seen).filter((a) => onlineAgents.has(a)).length;
      let status: TemplateAvailabilitySummary["status"] = "unknown";
      if (onlineSeen > 0) {
        if (onlinePresent === 0) status = "fail";
        else if (e.fonts.size > 0 || e.links.size > 0 || onlinePresent < onlineSeen) status = "warn";
        else status = "ok";
      }
      out.push({
        template_id: tid,
        status,
        agents_with_file: onlinePresent,
        agents_total: onlineSeen,
        fonts_missing_any: Array.from(e.fonts).slice(0, 20),
        links_missing_any: Array.from(e.links).slice(0, 20),
      });
    }
    return out;
  });
