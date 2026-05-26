import { createFileRoute } from "@tanstack/react-router";
import { authenticateAgent, json } from "@/lib/agent-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  enrichVariablesWithPages,
  type TemplatePageLite,
  type TemplateVariableLite,
} from "@/lib/template-pages";

// Agent polls for the next queued job for its workspace.
export const Route = createFileRoute("/api/public/agent/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await authenticateAgent(request);
          // Claim oldest queued job for AI/ID engines in this workspace.
          // Skip jobs whose next_retry_at is still in the future (transient
          // failures awaiting backoff).
          const nowIso = new Date().toISOString();
          const { data: job } = await supabaseAdmin
            .from("jobs")
            .select("id, project_id, engine, template_id, brief, variables, retry_count, max_retries, templates:template_id (id, name, engine, source_ref, variables, pages)")
            .eq("workspace_id", auth.workspaceId)
            .in("engine", ["illustrator", "indesign"])
            .eq("status", "queued")
            .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (!job) return json({ job: null });
          // Flatten the joined template under `template` and enrich each
          // variable with its resolved page index so the InDesign bridge can
          // scope frame swaps to the correct spread.
          const { templates, ...rest } = job as typeof job & { templates: unknown };
          const tpl = templates as
            | {
                id: string;
                name: string;
                engine: string;
                source_ref: string | null;
                variables: unknown;
                pages: unknown;
              }
            | null;
          let template: unknown = tpl;
          if (tpl) {
            const pages = (Array.isArray(tpl.pages) ? tpl.pages : []) as TemplatePageLite[];
            const variables = (Array.isArray(tpl.variables) ? tpl.variables : []) as TemplateVariableLite[];
            const enrichedVars = enrichVariablesWithPages(variables, pages);
            // Build per-page bundles so the bridge can iterate
            // `payload.byPage[i].variables` directly without re-grouping.
            const userValues = (job.variables as Record<string, unknown> | null) ?? {};
            const byPage = pages.map((p, i) => {
              const idx = i + 1;
              const fields = enrichedVars.filter((v) => v.page === idx);
              const values: Record<string, unknown> = {};
              for (const f of fields) if (f.name in userValues) values[f.name] = userValues[f.name];
              return {
                pageIndex: idx,
                pageName: p.name ?? `Page ${idx}`,
                kind: p.kind ?? "page",
                width: p.width ?? null,
                height: p.height ?? null,
                unit: p.unit ?? null,
                // For InDesign, page_index from the .indd; for AI, the artboard index.
                docIndex: typeof p.page_index === "number"
                  ? p.page_index
                  : typeof p.artboard_index === "number"
                    ? p.artboard_index
                    : idx,
                fields: fields.map((f) => ({ name: f.name, type: f.type ?? "text", layer: f.layer ?? null })),
                values,
              };
            });
            template = {
              ...tpl,
              variables: enrichedVars,
              pages,
              byPage,
              expectedOutputs: pages.length > 1
                ? {
                    perPage: ["preview", "pdf"],
                    master: ["pdf", "zip"],
                  }
                : { perPage: [], master: ["preview", "pdf"] },
            };
          }
          const flatJob = { ...rest, template };

          const { error } = await supabaseAdmin
            .from("jobs")
            .update({
              status: "running",
              assigned_agent_id: auth.agentId,
              claimed_at: new Date().toISOString(),
            })
            .eq("id", job.id)
            .eq("status", "queued");
          if (error) return json({ job: null });
          return json({ job: flatJob });
        } catch (e) {
          if (e instanceof Response) return e;
          return json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
