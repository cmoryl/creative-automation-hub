import { createFileRoute } from "@tanstack/react-router";
import { authenticateAgent, json } from "@/lib/agent-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const Item = z.object({
  template_id: z.string().uuid(),
  file_present: z.boolean(),
  fonts_missing: z.array(z.string().max(200)).max(200).default([]),
  links_missing: z.array(z.string().max(400)).max(500).default([]),
});

const Body = z.object({
  items: z.array(Item).max(500),
});

// Agent reports per-template local availability. Upserts on (template_id, agent_id).
export const Route = createFileRoute("/api/public/agent/templates/inventory")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await authenticateAgent(request);
          const parsed = Body.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success)
            return json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
          const { items } = parsed.data;
          if (items.length === 0) return json({ ok: true, updated: 0 });

          // Restrict inventory to templates that actually belong to this workspace.
          const templateIds = Array.from(new Set(items.map((i) => i.template_id)));
          const { data: tpls } = await supabaseAdmin
            .from("templates")
            .select("id")
            .eq("workspace_id", auth.workspaceId)
            .in("id", templateIds);
          const allowed = new Set((tpls ?? []).map((t) => t.id as string));

          const rows = items
            .filter((i) => allowed.has(i.template_id))
            .map((i) => ({
              template_id: i.template_id,
              agent_id: auth.agentId,
              workspace_id: auth.workspaceId,
              file_present: i.file_present,
              fonts_missing: i.fonts_missing as never,
              links_missing: i.links_missing as never,
              checked_at: new Date().toISOString(),
            }));

          if (rows.length === 0) return json({ ok: true, updated: 0 });

          const { error } = await supabaseAdmin
            .from("template_agent_availability")
            .upsert(rows, { onConflict: "template_id,agent_id" });
          if (error) return json({ error: error.message }, { status: 500 });
          return json({ ok: true, updated: rows.length });
        } catch (e) {
          if (e instanceof Response) return e;
          return json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
