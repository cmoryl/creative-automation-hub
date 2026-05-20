import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, Output } from "ai";
import Papa from "papaparse";
import { createLovableAiGatewayProvider } from "./ai-gateway";
import { generateClaudeCopy } from "./claude.functions";

const SUPPORTED_ENGINES = ["illustrator", "indesign", "figma", "canva", "claude"] as const;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const variableSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  type: z.string().optional(),
});

// --- briefAgentChat: single-turn agent reply with structured suggestions ---
export const briefAgentChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        templateName: z.string(),
        variables: z.array(variableSchema),
        currentMode: z.enum(["form", "stepper", "csv"]).nullable(),
        currentValues: z.record(z.string(), z.string()).default({}),
        messages: z.array(messageSchema).min(1).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const varList = data.variables
      .map((v) => `- ${v.name} (${v.type ?? "text"}): ${v.label ?? v.name}`)
      .join("\n");

    const system = `You are a creative brief assistant helping a user fill out a design template called "${data.templateName}".

Editable fields:
${varList}

The user can fill it via THREE input modes:
- "form": single flat form (best for 1 variation, casual brief)
- "stepper": section-by-section wizard (best for 1 rich variation, deliberate walkthrough)
- "csv": upload a CSV (best for batches — multiple variations at once)

Current mode: ${data.currentMode ?? "(not chosen)"}
Current filled values: ${JSON.stringify(data.currentValues)}

Your job each turn:
1. Have a short, friendly conversation (1-3 sentences in "reply").
2. If the user hasn't chosen a mode yet, recommend one in "suggestedMode" based on what they said (one variation vs many, casual vs deliberate).
3. Whenever the user gives you facts (client name, stats, quotes, etc.), map them into "prefillValues" keyed by the field "name" above. Only include fields you have real info for.
4. If the user is in stepper mode and you can usefully group fields, return "suggestedSections" — an array of { id, title, fieldNames[] }.

Be concise and concrete. Never invent data the user didn't give.`;

    const { output } = await generateText({
      model,
      system,
      messages: data.messages,
      output: Output.object({
        schema: z.object({
          reply: z.string(),
          suggestedMode: z.enum(["form", "stepper", "csv"]).nullable().optional(),
          prefillValues: z.record(z.string(), z.string()).optional(),
          suggestedSections: z
            .array(
              z.object({
                id: z.string(),
                title: z.string(),
                fieldNames: z.array(z.string()),
              }),
            )
            .optional(),
        }),
      }),
    });

    return output;
  });

// --- parseCsvFile: read uploaded CSV from storage, suggest column→variable mapping ---
export const parseCsvFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        storagePath: z.string().min(1),
        variables: z.array(variableSchema),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: file, error } = await supabase.storage
      .from("brief-uploads")
      .download(data.storagePath);
    if (error || !file) throw error ?? new Error("File not found");
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    const headers = parsed.meta.fields ?? [];
    const rows = (parsed.data ?? []).slice(0, 200);

    // Simple auto-mapping: case-insensitive exact / contains match
    const mapping: Record<string, string> = {};
    for (const v of data.variables) {
      const lc = v.name.toLowerCase();
      const lbl = (v.label ?? "").toLowerCase();
      const hit = headers.find(
        (h) =>
          h.toLowerCase() === lc ||
          h.toLowerCase() === lbl ||
          (lbl && h.toLowerCase().includes(lbl)) ||
          h.toLowerCase().includes(lc),
      );
      if (hit) mapping[v.name] = hit;
    }
    return { headers, rows, mapping, total: rows.length };
  });

// --- dispatchVariations: fan rows × engines into projects/jobs/outputs ---
export const dispatchVariations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        templateId: z.string().uuid(),
        engines: z.array(z.enum(SUPPORTED_ENGINES)).min(1).max(4),
        briefSummary: z.string().max(2000).optional(),
        rows: z
          .array(
            z.object({
              label: z.string().min(1).max(200),
              values: z.record(z.string(), z.string()),
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: tpl, error: tplErr } = await supabase
      .from("templates")
      .select("id, name, workspace_id, preview_url, source_ref")
      .eq("id", data.templateId)
      .single();
    if (tplErr) throw tplErr;

    const { data: agents } = await supabase
      .from("agent_pairings")
      .select("last_seen")
      .eq("workspace_id", tpl.workspace_id)
      .order("last_seen", { ascending: false })
      .limit(1);
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const hasLiveAgent =
      !!agents?.[0]?.last_seen &&
      new Date(agents[0].last_seen).getTime() > fiveMinAgo;

    const created: { projectId: string; jobIds: string[]; label: string }[] = [];

    for (const row of data.rows) {
      const { data: proj, error: projErr } = await supabase
        .from("projects")
        .insert({
          workspace_id: tpl.workspace_id,
          name: `${tpl.name} — ${row.label}`,
          status: "active",
          created_by: userId,
          brief: data.briefSummary ?? `Variation: ${row.label}`,
        })
        .select("id")
        .single();
      if (projErr) throw projErr;

      const jobIds: string[] = [];
      for (const engine of data.engines) {
        const needsBridge = engine === "illustrator" || engine === "indesign";
        const willMock = !needsBridge;

        const { data: job, error: jobErr } = await supabase
          .from("jobs")
          .insert({
            project_id: proj.id,
            workspace_id: tpl.workspace_id,
            template_id: tpl.id,
            engine,
            row_label: row.label,
            status: willMock ? "completed" : "queued",
            brief: {
              summary: data.briefSummary ?? "",
              row: row.label,
              progress: needsBridge
                ? {
                    stage: hasLiveAgent ? "queued" : "awaiting_agent",
                    percent: 0,
                    message: hasLiveAgent
                      ? "Waiting for the local bridge agent to claim this job."
                      : "No live bridge agent detected. Start the local agent to render this job.",
                  }
                : null,
            } as never,
            variables: row.values as never,
            completed_at: willMock ? new Date().toISOString() : null,
          })
          .select("id")
          .single();
        if (jobErr) throw jobErr;
        jobIds.push(job.id);

        if (willMock && tpl.preview_url) {
          await supabase.from("outputs").insert({
            job_id: job.id,
            kind: "png",
            url: tpl.preview_url,
            metadata: {
              mock: true,
              engine,
              row_label: row.label,
              variables: row.values,
            } as never,
          });
        }
      }
      created.push({ projectId: proj.id, jobIds, label: row.label });
    }

      return { created, hasLiveAgent };
  });

// --- uploadBriefFile: returns a signed upload URL (browser uploads directly) ---
export const createBriefUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ filename: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();
    if (!ws) throw new Error("No workspace");
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${ws.id}/${Date.now()}-${safe}`;
    const { data: signed, error } = await supabase.storage
      .from("brief-uploads")
      .createSignedUploadUrl(path);
    if (error) throw error;
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

// Signed upload into the PUBLIC job-outputs bucket — used for hero/image
// template fields so the bridge agent can fetch the asset by public URL.
export const createHeroImageUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ filename: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();
    if (!ws) throw new Error("No workspace");
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${ws.id}/hero/${Date.now()}-${safe}`;
    const { data: signed, error } = await supabase.storage
      .from("job-outputs")
      .createSignedUploadUrl(path);
    if (error) throw error;
    const { data: pub } = supabase.storage.from("job-outputs").getPublicUrl(path);
    return {
      path,
      token: signed.token,
      signedUrl: signed.signedUrl,
      publicUrl: pub.publicUrl,
    };
  });
