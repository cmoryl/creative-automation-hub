// Simple brand-safety guardrail: per-brand list of forbidden words/phrases,
// stored on companies.brand_metadata.forbidden_words. checkBatchRows() scans
// a set of row values and reports the first match per row + field.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const setBrandForbiddenWords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        companyId: z.string().uuid(),
        words: z.array(z.string().trim().min(1).max(120)).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error: getErr } = await context.supabase
      .from("companies")
      .select("brand_metadata")
      .eq("id", data.companyId)
      .single();
    if (getErr) throw getErr;
    const meta = ((row?.brand_metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    meta.forbidden_words = Array.from(new Set(data.words.map((w) => w.toLowerCase()))).sort();
    const { error } = await context.supabase
      .from("companies")
      .update({ brand_metadata: meta as never })
      .eq("id", data.companyId);
    if (error) throw error;
    return { count: (meta.forbidden_words as string[]).length };
  });

export const checkBatchRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        companyId: z.string().uuid().optional(),
        rows: z
          .array(
            z.object({
              label: z.string(),
              values: z.record(z.string(), z.string()),
            }),
          )
          .max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!data.companyId) return { violations: [], wordCount: 0 };
    const { data: row } = await context.supabase
      .from("companies")
      .select("brand_metadata")
      .eq("id", data.companyId)
      .maybeSingle();
    const meta = ((row?.brand_metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    const words = (meta.forbidden_words as string[] | undefined) ?? [];
    if (!words.length) return { violations: [], wordCount: 0 };
    const regexes = words.map((w) => new RegExp(`\\b${w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i"));

    const violations: Array<{ rowLabel: string; field: string; word: string; snippet: string }> = [];
    for (const r of data.rows) {
      for (const [field, val] of Object.entries(r.values)) {
        if (typeof val !== "string") continue;
        for (let i = 0; i < regexes.length; i++) {
          const m = regexes[i].exec(val);
          if (m) {
            violations.push({
              rowLabel: r.label,
              field,
              word: words[i],
              snippet: val.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20),
            });
            break;
          }
        }
      }
    }
    return { violations, wordCount: words.length };
  });
