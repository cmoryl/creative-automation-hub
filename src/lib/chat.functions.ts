import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listChatMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

const SYSTEM_PROMPT = `You are the Creative Automation orchestrator.
Your job: turn a creative brief into a concrete plan to generate on-brand creative variants
using one or more template engines (Canva, Figma, Illustrator, InDesign).

When the user describes a campaign, you should:
1. Clarify audience, channels, sizes, and key messages if missing.
2. Recommend an engine: Canva or Figma for editable web flow, Illustrator/InDesign via the local bridge agent for press-ready output.
3. Propose template variables (headline, subhead, CTA, image refs, color tokens).
4. Summarize the plan as a structured job spec the user can approve.

Be concise. Use short numbered lists. Never invent template IDs.`;

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projectId: z.string().uuid(),
      message: z.string().min(1).max(8000),
    }).parse(input),
  )
  .handler(async function* ({ data, context }) {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    // persist user message
    await supabase.from("chat_messages").insert({
      project_id: data.projectId,
      role: "user",
      content: data.message,
    });

    // load history
    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true });

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content ?? "" })),
    ];

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const body = await upstream.text();
      throw new Error(`AI gateway error ${upstream.status}: ${body.slice(0, 200)}`);
    }

    let assembled = "";
    const reader = upstream.body.pipeThrough(new TextDecoderStream()).getReader();
    let leftover = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        leftover += value;
        const lines = leftover.split("\n");
        leftover = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              assembled += delta;
              yield { delta };
            }
          } catch {
            // ignore parse errors on partial chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (assembled.length > 0) {
      await supabase.from("chat_messages").insert({
        project_id: data.projectId,
        role: "assistant",
        content: assembled,
      });
    }
  });
