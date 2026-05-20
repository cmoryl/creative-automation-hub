import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listAgentPairings } from "@/lib/workspace.functions";
import { Settings, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/agent")({
  component: AgentSettings,
});

function AgentSettings() {
  const fetchPairings = useServerFn(listAgentPairings);
  const { data = [] } = useQuery({
    queryKey: ["pairings"],
    queryFn: () => fetchPairings(),
  });

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Local Bridge Agent</h1>
        <p className="text-sm text-muted-foreground">
          Illustrator and InDesign templates run through a tiny headless agent on your machine — no Electron window required.
        </p>
      </header>

      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-start gap-3">
          <Settings className="mt-0.5 h-5 w-5 text-primary" />
          <div className="flex-1">
            <h2 className="font-semibold">Pairing (Phase 2)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The bridge agent installer ships in the next release. It wraps the existing Illustrator + InDesign engines and
              polls this workspace for jobs over a paired, token-secured channel.
            </p>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Generate a pairing token here</li>
              <li>Install the agent (one-time, ~20 MB)</li>
              <li>Run the agent — it appears below as "Online"</li>
              <li>Submit AI/ID jobs from any project — they route to your agent</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Paired agents</h3>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agents paired yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {data.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium">{a.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  Last seen: {a.last_seen ? new Date(a.last_seen).toLocaleString() : "never"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
