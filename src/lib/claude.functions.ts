import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const variableSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  type: z.string().optional(),
});

async function callAnthropic({
  system,
  messages,
  maxTokens = 4096,
}: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured. Add it in Settings → Secrets.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }
  const json = await res.json();
  return json.content?.[0]?.text ?? "";
}

// Fallback using Lovable AI Gateway when Anthropic key is missing.
async function callFallback({ system, user }: { system: string; user: string }) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing — cannot fallback.");
  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("openai/gpt-5-mini");
  const { text } = await generateText({
    model,
    system,
    messages: [{ role: "user", content: user }],
  });
  return text;
}

// --- generateClaudeCopy: produce copy for a set of template variables ---
export const generateClaudeCopy = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        templateName: z.string(),
        variables: z.array(variableSchema),
        brief: z.string().default(""),
        rowLabel: z.string().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const varList = data.variables
      .map((v) => `- ${v.name} (${v.type ?? "text"}): ${v.label ?? v.name}`)
      .join("\n");

    const system = `You are an expert creative copywriter. Given a design template and a brief, generate compelling, on-brand copy for each template variable.

Rules:
- Only output a JSON object: {"copy": {"variableName": "generated text", ...}}
- Do not wrap in markdown code fences.
- Keep each value concise and appropriate for its field type.
- Use the brief context to infer tone and messaging.`;

    const userPrompt = `Template: "${data.templateName}"
Variation label: ${data.rowLabel || "(none)"}
Brief: ${data.brief || "(none provided)"}

Variables to fill:
${varList}`;

    let raw = "";
    try {
      raw = await callAnthropic({
        system,
        messages: [{ role: "user", content: userPrompt }],
      });
    } catch (e: any) {
      if (e.message?.includes("ANTHROPIC_API_KEY")) {
        raw = await callFallback({ system, user: userPrompt });
      } else {
        throw e;
      }
    }

    // Strip markdown fences if present
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    let parsed: { copy?: Record<string, string> } = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // If not valid JSON, return the raw text as a single "copy" field
      parsed = { copy: { generated: raw.trim() } };
    }

    return {
      copy: parsed.copy ?? {},
      raw,
      usedFallback: !process.env.ANTHROPIC_API_KEY,
    };
  });
