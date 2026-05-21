import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import type { TemplateAvailabilitySummary } from "@/lib/template-requirements.functions";

export function TemplateAvailabilityPill({
  summary,
}: {
  summary?: TemplateAvailabilitySummary | null;
}) {
  if (!summary || summary.status === "unknown") {
    return (
      <span
        title="No online agent has reported availability for this template yet."
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground"
      >
        <HelpCircle className="h-3 w-3" />
        unknown
      </span>
    );
  }
  if (summary.status === "ok") {
    return (
      <span
        title={`${summary.agents_with_file}/${summary.agents_total} agent(s) have the file`}
        className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300"
      >
        <CheckCircle2 className="h-3 w-3" />
        ready
      </span>
    );
  }
  if (summary.status === "warn") {
    return (
      <span
        title={[
          `${summary.agents_with_file}/${summary.agents_total} agent(s) have the file`,
          summary.fonts_missing_any.length
            ? `Missing fonts: ${summary.fonts_missing_any.slice(0, 3).join(", ")}`
            : "",
          summary.links_missing_any.length
            ? `Missing links: ${summary.links_missing_any.slice(0, 3).join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join(" · ")}
        className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300"
      >
        <AlertTriangle className="h-3 w-3" />
        partial
      </span>
    );
  }
  return (
    <span
      title={`No online agent has the file (${summary.agents_total} reporting)`}
      className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-700 dark:text-red-300"
    >
      <XCircle className="h-3 w-3" />
      missing
    </span>
  );
}
