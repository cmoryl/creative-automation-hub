import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { runPreflight, type PreflightResult } from "@/lib/preflight.functions";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type Engine =
  | "illustrator"
  | "indesign"
  | "figma"
  | "canva"
  | "claude"
  | "hybrid"
  | "mock";

export function PreflightPanel({
  projectId,
  engine,
  templateId,
  variables,
  compact,
}: {
  projectId: string;
  engine: Engine;
  templateId?: string;
  variables?: Record<string, unknown>;
  compact?: boolean;
}) {
  const fn = useServerFn(runPreflight);
  const [manualRefresh, setManualRefresh] = useState(0);
  const { data, isFetching, refetch } = useQuery<PreflightResult>({
    queryKey: ["preflight", projectId, engine, templateId, manualRefresh],
    queryFn: () =>
      fn({ data: { projectId, engine, templateId, variables } }) as Promise<PreflightResult>,
    refetchInterval: 60_000,
  });

  return (
    <div
      className={`rounded-lg border bg-card ${compact ? "p-3" : "p-5"}`}
      data-preflight-ok={data?.ok ?? false}
    >
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Preflight · {engine}
          {data && (
            <span
              className={`ml-1 rounded px-2 py-0.5 text-[10px] ${
                data.ok
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-red-500/15 text-red-700 dark:text-red-300"
              }`}
            >
              {data.ok ? "ready" : `${data.blocking.length} blocker${data.blocking.length === 1 ? "" : "s"}`}
            </span>
          )}
        </h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setManualRefresh((n) => n + 1);
            refetch();
          }}
          disabled={isFetching}
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {!data ? (
        <p className="mt-2 text-xs text-muted-foreground">Running checks…</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {data.checks.map((c) => (
            <li
              key={c.id}
              className="flex items-start gap-2 rounded border bg-background/40 px-2 py-1.5 text-xs"
            >
              {c.status === "pass" && (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              )}
              {c.status === "warn" && (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              )}
              {c.status === "fail" && (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium">{c.label}</div>
                {c.detail && <div className="text-muted-foreground">{c.detail}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Imperative helper for "Submit" buttons. Resolves to the preflight result.
export function usePreflight() {
  const fn = useServerFn(runPreflight);
  return (args: {
    projectId: string;
    engine: Engine;
    templateId?: string;
    variables?: Record<string, unknown>;
  }) => fn({ data: args }) as Promise<PreflightResult>;
}
