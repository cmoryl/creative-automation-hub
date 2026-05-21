import { useState } from "react";
import {
  AlertCircle,
  Copy,
  Type,
  Link as LinkIcon,
  FileWarning,
  ChevronDown,
  Lightbulb,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type RenderErrorFrame = {
  frame: string;
  page?: number;
  layer?: string;
  variable?: string;
  error_code?: string | number;
  message?: string;
  extendscript_log?: string;
  suggestion?: string;
};

export type RenderErrorDetail = {
  message?: string;
  stack?: string;
  extendscript_log?: string;
  missing_fonts?: string[];
  font_substitutions?: { requested: string; used: string }[];
  missing_links?: string[];
  files?: { name: string; path?: string; exists?: boolean }[];
  frames?: RenderErrorFrame[];
  suggestions?: string[];
  agent_version?: string;
};

const STAGE_LABEL: Record<string, string> = {
  open: "Open document",
  fonts: "Resolve fonts",
  links: "Resolve linked assets",
  swap: "Swap variables",
  export: "Export output",
  upload: "Upload to storage",
  other: "Render",
};

export function RenderErrorReport({
  error,
  errorStage,
  errorDetail,
  jobId,
}: {
  error?: string | null;
  errorStage?: string | null;
  errorDetail?: RenderErrorDetail | null;
  jobId: string;
}) {
  const [open, setOpen] = useState(false);
  const d = errorDetail ?? null;
  const headline =
    d?.message ?? error?.split("\n")[0] ?? "Render failed without a message.";
  const stageLabel = errorStage ? STAGE_LABEL[errorStage] ?? errorStage : null;

  const hasStructured =
    !!d &&
    (d.extendscript_log ||
      (d.missing_fonts && d.missing_fonts.length) ||
      (d.font_substitutions && d.font_substitutions.length) ||
      (d.missing_links && d.missing_links.length) ||
      (d.files && d.files.length) ||
      (d.frames && d.frames.length) ||
      (d.suggestions && d.suggestions.length) ||
      d.stack);

  const copyDiagnostics = () => {
    const payload = {
      jobId,
      stage: errorStage ?? null,
      error: error ?? null,
      detail: d,
      copiedAt: new Date().toISOString(),
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast.success("Diagnostics copied to clipboard");
  };

  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
            {stageLabel ? `Failed at: ${stageLabel}` : "Render failed"}
            {d?.agent_version && (
              <span className="rounded bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                agent v{d.agent_version}
              </span>
            )}
          </div>
          <p className="mt-0.5 break-words text-xs text-red-700/90 dark:text-red-300/90">
            {headline}
          </p>

          {d?.missing_fonts && d.missing_fonts.length > 0 && (
            <Section icon={Type} label={`Missing fonts (${d.missing_fonts.length})`}>
              <div className="flex flex-wrap gap-1">
                {d.missing_fonts.slice(0, 30).map((f) => (
                  <span
                    key={f}
                    className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-300"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {d?.font_substitutions && d.font_substitutions.length > 0 && (
            <Section icon={Type} label={`Font substitutions (${d.font_substitutions.length})`}>
              <ul className="space-y-0.5 text-[11px]">
                {d.font_substitutions.slice(0, 20).map((s, i) => (
                  <li key={i} className="text-muted-foreground">
                    <span className="font-medium text-foreground">{s.requested}</span>
                    {" → "}
                    {s.used}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {d?.missing_links && d.missing_links.length > 0 && (
            <Section icon={LinkIcon} label={`Missing linked assets (${d.missing_links.length})`}>
              <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                {d.missing_links.slice(0, 20).map((l) => (
                  <li key={l} className="truncate">
                    {l}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {d?.files && d.files.length > 0 && (
            <Section icon={FileWarning} label={`Files checked (${d.files.length})`}>
              <ul className="space-y-0.5 text-[11px]">
                {d.files.slice(0, 20).map((f, i) => (
                  <li
                    key={i}
                    className={
                      f.exists === false
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                    }
                  >
                    {f.exists === false ? "✗ " : "✓ "}
                    {f.name}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {hasStructured && (d?.extendscript_log || d?.stack) && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} />
              {open ? "Hide" : "Show"} raw log
            </button>
          )}

          {open && (d?.extendscript_log || d?.stack) && (
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-background/80 p-2 text-[10px] leading-snug text-muted-foreground">
              {d?.extendscript_log ?? d?.stack}
            </pre>
          )}

          <Button
            size="sm"
            variant="outline"
            className="mt-3 h-7 text-xs"
            onClick={copyDiagnostics}
          >
            <Copy className="mr-1 h-3 w-3" /> Copy diagnostics
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Type;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded border bg-background/60 p-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      {children}
    </div>
  );
}
