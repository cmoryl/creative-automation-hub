import { CheckCircle2, Circle, Cpu, HardDrive, Type, Activity, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentStatusRow } from "@/lib/agent-status.functions";

function formatRelative(iso: string | null) {
  if (!iso) return "never";
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000) return `${Math.max(1, Math.round(d / 1000))}s ago`;
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString();
}

export function AgentStatusCard({
  agent,
  onRemove,
}: {
  agent: AgentStatusRow;
  onRemove?: (id: string) => void;
}) {
  const s = agent.status;
  const apps = s?.apps ?? {};
  const appBadges = (["illustrator", "indesign", "figma", "canva"] as const)
    .map((name) => {
      const meta = (apps as Record<string, { installed?: boolean; version?: string }>)[name];
      return {
        name,
        installed: meta?.installed === true,
        version: meta?.version ?? null,
      };
    });

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {agent.online ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div>
            <h3 className="font-semibold">{agent.name}</h3>
            <p className="text-xs text-muted-foreground">
              {s?.host ?? "Host unknown"}
              {s?.platform ? ` · ${s.platform}` : ""}
              {s?.agent_version ? ` · v${s.agent_version}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Last seen {formatRelative(agent.last_seen)}
              {s?.reported_at ? ` · reported ${formatRelative(s.reported_at)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-xs ${
              agent.online
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {agent.online ? "online" : "offline"}
          </span>
          {onRemove && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRemove(agent.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {s ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat icon={Cpu} label="Apps">
              <div className="flex flex-wrap gap-1">
                {appBadges.map((a) => (
                  <span
                    key={a.name}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      a.installed
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground line-through"
                    }`}
                    title={a.version ?? undefined}
                  >
                    {a.name}
                  </span>
                ))}
              </div>
            </Stat>
            <Stat icon={Type} label="Fonts">
              <span className="text-sm font-medium">{s.fonts_count.toLocaleString()}</span>
            </Stat>
            <Stat icon={HardDrive} label="Disk free">
              <span className="text-sm font-medium">
                {s.disk_free_mb != null ? `${(s.disk_free_mb / 1024).toFixed(1)} GB` : "—"}
              </span>
            </Stat>
            <Stat icon={Activity} label="Local templates">
              <span className="text-sm font-medium">{s.templates_seen}</span>
            </Stat>
          </div>
          {s.current_job_id && (
            <p className="mt-3 rounded bg-blue-500/10 px-2 py-1 text-xs text-blue-700 dark:text-blue-300">
              Currently rendering job {s.current_job_id.slice(0, 8)}…
            </p>
          )}
        </>
      ) : (
        <p className="mt-4 rounded border border-dashed p-3 text-xs text-muted-foreground">
          This agent has not yet reported its host inventory. Update the local bridge agent so it
          posts to <code className="font-mono">/api/public/agent/status</code>.
        </p>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Cpu;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border bg-background/50 p-2">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      {children}
    </div>
  );
}
