import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type PreflightStatus = "pass" | "warn" | "fail";

export type PreflightCheck = {
  id: string;
  label: string;
  status: PreflightStatus;
  detail?: string;
};

export type PreflightResult = {
  ok: boolean;
  blocking: PreflightCheck[];
  warnings: PreflightCheck[];
  checks: PreflightCheck[];
};

const ENGINES = [
  "illustrator",
  "indesign",
  "figma",
  "canva",
  "claude",
  "hybrid",
  "mock",
] as const;

const ONLINE_MS = 60_000;

export const runPreflight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        engine: z.enum(ENGINES),
        templateId: z.string().uuid().optional(),
        variables: z.record(z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PreflightResult> => {
    const { supabase } = context;
    const checks: PreflightCheck[] = [];

    const { data: project } = await supabase
      .from("projects")
      .select("id, workspace_id, name")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) {
      const fail: PreflightCheck = {
        id: "project",
        label: "Project exists",
        status: "fail",
        detail: "Project not found.",
      };
      return { ok: false, blocking: [fail], warnings: [], checks: [fail] };
    }
    checks.push({ id: "project", label: "Project exists", status: "pass" });

    const isDesktop = data.engine === "illustrator" || data.engine === "indesign" || data.engine === "hybrid";
    const isFigma = data.engine === "figma" || data.engine === "hybrid";
    const isCanva = data.engine === "canva";

    // ---- Template check ----
    type Tpl = {
      id: string;
      name: string;
      engine: string;
      variables: unknown;
      requirements: { fonts?: { family: string }[]; links?: { name: string }[] } | null;
    };
    let template: Tpl | null = null;
    if (data.templateId) {
      const { data: t } = await supabase
        .from("templates")
        .select("id, name, engine, variables, requirements")
        .eq("id", data.templateId)
        .maybeSingle();
      template = (t as unknown as Tpl | null) ?? null;
      if (!template) {
        checks.push({
          id: "template",
          label: "Template registered",
          status: "fail",
          detail: "Template not found in workspace.",
        });
      } else {
        checks.push({
          id: "template",
          label: `Template registered (${template.name})`,
          status: "pass",
        });

        // Variable completeness
        const required = (Array.isArray(template.variables) ? template.variables : []) as Array<{
          name: string;
          required?: boolean;
        }>;
        const provided = data.variables ?? {};
        const missingVars = required
          .filter((v) => v.required !== false)
          .map((v) => v.name)
          .filter((name) => {
            const val = (provided as Record<string, unknown>)[name];
            return val === undefined || val === null || val === "";
          });
        if (missingVars.length > 0 && data.variables) {
          checks.push({
            id: "variables",
            label: "All variables filled",
            status: "warn",
            detail: `Missing values: ${missingVars.slice(0, 5).join(", ")}${missingVars.length > 5 ? "…" : ""}`,
          });
        } else if (data.variables) {
          checks.push({ id: "variables", label: "All variables filled", status: "pass" });
        }
      }
    }

    // ---- Online agent check (desktop engines) ----
    if (isDesktop) {
      const since = new Date(Date.now() - ONLINE_MS).toISOString();
      const { data: onlineAgents } = await supabase
        .from("agent_pairings")
        .select("id, name, last_seen")
        .gte("last_seen", since);
      const onlineIds = (onlineAgents ?? []).map((a) => a.id as string);
      if (onlineIds.length === 0) {
        checks.push({
          id: "agent_online",
          label: "Bridge agent online",
          status: "fail",
          detail:
            "No desktop agent has checked in within the last 60 s. Start the Lovable Agent on the machine that runs Illustrator / InDesign.",
        });
      } else {
        // Filter agents that report installing the required app(s).
        const { data: statuses } = await supabase
          .from("agent_status")
          .select("agent_id, apps")
          .in("agent_id", onlineIds);
        const requiredApps =
          data.engine === "hybrid" ? ["illustrator", "indesign"] : [data.engine];
        const capableAgents = (statuses ?? []).filter((s) => {
          const apps = (s.apps as Record<string, { installed?: boolean }>) ?? {};
          return requiredApps.every((a) => apps[a]?.installed === true);
        });
        if (capableAgents.length === 0) {
          // Online agents exist but none have reported app inventory.
          // Old agents (pre-status-monitor) won't have an agent_status row yet.
          checks.push({
            id: "agent_capable",
            label: `Agent supports ${requiredApps.join(" + ")}`,
            status: "warn",
            detail:
              "Online agents have not reported their installed apps yet — update the bridge agent so it posts /api/public/agent/status.",
          });
        } else {
          checks.push({
            id: "agent_capable",
            label: `Agent supports ${requiredApps.join(" + ")}`,
            status: "pass",
            detail: `${capableAgents.length} agent(s) online and capable.`,
          });
        }

        // ---- Template availability on online+capable agents ----
        if (template) {
          const capableIds = capableAgents.length > 0 ? capableAgents.map((a) => a.agent_id as string) : onlineIds;
          const { data: avail } = await supabase
            .from("template_agent_availability")
            .select("agent_id, file_present, fonts_missing, links_missing")
            .eq("template_id", template.id)
            .in("agent_id", capableIds);
          const rows = avail ?? [];
          if (rows.length === 0) {
            checks.push({
              id: "template_local",
              label: "Template file on disk",
              status: "warn",
              detail:
                "No agent has reported availability for this template yet. Run the agent's template inventory.",
            });
          } else {
            const withFile = rows.filter((r) => r.file_present);
            if (withFile.length === 0) {
              checks.push({
                id: "template_local",
                label: "Template file on disk",
                status: "fail",
                detail: `Source file is missing on every reporting agent (${rows.length}). Copy the .ai / .indd into the agent's templates folder.`,
              });
            } else if (withFile.length < rows.length) {
              checks.push({
                id: "template_local",
                label: "Template file on disk",
                status: "warn",
                detail: `${withFile.length}/${rows.length} agents have the file.`,
              });
            } else {
              checks.push({
                id: "template_local",
                label: "Template file on disk",
                status: "pass",
              });
            }

            // Fonts
            const fontsMissing = new Set<string>();
            const linksMissing = new Set<string>();
            for (const r of withFile) {
              for (const f of (r.fonts_missing as string[]) ?? []) fontsMissing.add(f);
              for (const l of (r.links_missing as string[]) ?? []) linksMissing.add(l);
            }
            if (fontsMissing.size > 0) {
              const list = Array.from(fontsMissing);
              checks.push({
                id: "fonts",
                label: "Required fonts installed",
                status: "fail",
                detail: `Missing on at least one agent: ${list.slice(0, 5).join(", ")}${list.length > 5 ? `… (+${list.length - 5})` : ""}`,
              });
            } else {
              checks.push({ id: "fonts", label: "Required fonts installed", status: "pass" });
            }
            if (linksMissing.size > 0) {
              const list = Array.from(linksMissing);
              checks.push({
                id: "links",
                label: "Linked assets resolved",
                status: "fail",
                detail: `Missing links: ${list.slice(0, 3).join(", ")}${list.length > 3 ? "…" : ""}`,
              });
            } else {
              checks.push({ id: "links", label: "Linked assets resolved", status: "pass" });
            }
          }
        }
      }
    }

    // ---- Integration tokens (Figma / Canva) ----
    if (isFigma || isCanva) {
      const providers: string[] = [];
      if (isFigma) providers.push("figma");
      if (isCanva) providers.push("canva");
      for (const provider of providers) {
        const { data: integ } = await supabase
          .from("workspace_integrations")
          .select("id")
          .eq("workspace_id", project.workspace_id)
          .eq("provider", provider)
          .maybeSingle();
        if (!integ) {
          checks.push({
            id: `integration_${provider}`,
            label: `${provider} connected`,
            status: data.engine === "hybrid" ? "warn" : "fail",
            detail: `No ${provider} token saved — ${provider} renders will fail until you connect it.`,
          });
        } else {
          checks.push({
            id: `integration_${provider}`,
            label: `${provider} connected`,
            status: "pass",
          });
        }
      }
    }

    const blocking = checks.filter((c) => c.status === "fail");
    const warnings = checks.filter((c) => c.status === "warn");
    return { ok: blocking.length === 0, blocking, warnings, checks };
  });
