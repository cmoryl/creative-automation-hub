import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getTemplateAvailability,
  type TemplateAvailabilityRow,
} from "@/lib/template-requirements.functions";
import { CheckCircle2, AlertTriangle, XCircle, MonitorCheck } from "lucide-react";

export function TemplateAvailabilityDetail({ templateId }: { templateId: string }) {
  const fn = useServerFn(getTemplateAvailability);
  const { data, isLoading } = useQuery<TemplateAvailabilityRow[]>({
    queryKey: ["template-availability", templateId],
    queryFn: () => fn({ data: { templateId } }),
    refetchInterval: 30_000,
  });

  return (
    <div className="mt-5 rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <MonitorCheck className="h-3.5 w-3.5" />
        Agent availability
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Checking agents…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No agent has reported on this template yet. Local agents inventory templates on
          startup and every 5 minutes.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {data.map((row) => {
            const ok = row.file_present && row.fonts_missing.length === 0 && row.links_missing.length === 0;
            const warn = row.file_present && (row.fonts_missing.length > 0 || row.links_missing.length > 0);
            return (
              <li
                key={row.agent_id}
                className="flex items-start gap-2 rounded border bg-background/40 px-2 py-1.5 text-xs"
              >
                {ok && <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                {warn && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />}
                {!row.file_present && <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="truncate">{row.agent_name}</span>
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${row.agent_online ? "bg-emerald-400" : "bg-muted-foreground"}`}
                    />
                  </div>
                  {!row.file_present && (
                    <div className="text-red-600 dark:text-red-300">Template file missing on this host.</div>
                  )}
                  {row.fonts_missing.length > 0 && (
                    <div className="text-muted-foreground">
                      Missing fonts: {row.fonts_missing.slice(0, 5).join(", ")}
                      {row.fonts_missing.length > 5 && ` (+${row.fonts_missing.length - 5})`}
                    </div>
                  )}
                  {row.links_missing.length > 0 && (
                    <div className="text-muted-foreground">
                      Missing links: {row.links_missing.slice(0, 5).join(", ")}
                      {row.links_missing.length > 5 && ` (+${row.links_missing.length - 5})`}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
