import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAgentCoverage } from "@/lib/agent-status.functions";
import { CheckCircle2, AlertTriangle } from "lucide-react";

// Compact "X/Y agents online for Illustrator" pill, suitable in page headers.
export function AgentBadge({ engine }: { engine?: "illustrator" | "indesign" }) {
  const fn = useServerFn(getAgentCoverage);
  const { data } = useQuery({
    queryKey: ["agent-coverage"],
    queryFn: () => fn(),
    refetchInterval: 30_000,
  });
  if (!data) return null;

  if (engine) {
    const c = data.engines[engine];
    if (!c || c.total === 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3 w-3" />
          No {engine} agent
        </span>
      );
    }
    const ok = c.online > 0;
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
          ok
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : "bg-red-500/15 text-red-700 dark:text-red-300"
        }`}
      >
        {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
        {c.online}/{c.total} {engine} {c.online === 1 ? "agent" : "agents"} online
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
        data.onlineAgents > 0
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "bg-red-500/15 text-red-700 dark:text-red-300"
      }`}
    >
      {data.onlineAgents > 0 ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <AlertTriangle className="h-3 w-3" />
      )}
      {data.onlineAgents}/{data.totalAgents} bridge agents online
    </span>
  );
}
