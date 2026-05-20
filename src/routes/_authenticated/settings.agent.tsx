import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listAgentPairings } from "@/lib/workspace.functions";
import { createAgentPairing, deleteAgentPairing } from "@/lib/agent.functions";
import { Settings, CheckCircle2, Copy, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/agent")({
  component: AgentSettings,
});

function AgentSettings() {
  const fetchPairings = useServerFn(listAgentPairings);
  const createFn = useServerFn(createAgentPairing);
  const deleteFn = useServerFn(deleteAgentPairing);
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["pairings"],
    queryFn: () => fetchPairings(),
  });

  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<{ token: string; workspaceId: string } | null>(null);

  const apiBase = typeof window !== "undefined" ? window.location.origin : "";

  const create = async () => {
    if (!name.trim()) return;
    try {
      const res = await createFn({ data: { name: name.trim() } });
      setNewToken({ token: res.token, workspaceId: res.workspaceId });
      setName("");
      qc.invalidateQueries({ queryKey: ["pairings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const remove = async (id: string) => {
    await deleteFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["pairings"] });
  };

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Local Bridge Agent</h1>
        <p className="text-sm text-muted-foreground">
          A tiny headless Node service on your machine wraps Illustrator + InDesign and polls this workspace for jobs.
        </p>
      </header>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Settings className="h-4 w-4 text-primary" /> Pair a new agent
        </h2>
        <div className="mt-4 flex gap-2">
          <Input
            placeholder="Agent name (e.g. Studio Mac)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button onClick={create}><Plus className="h-4 w-4" /> Create token</Button>
        </div>

        {newToken && (
          <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="text-sm font-medium">Copy this once — it won't be shown again.</p>
            <pre className="mt-2 overflow-auto rounded bg-background p-2 text-xs">{newToken.token}</pre>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => {
                navigator.clipboard.writeText(newToken.token);
                toast.success("Copied");
              }}
            >
              <Copy className="h-3 w-3" /> Copy token
            </Button>
            <pre className="mt-3 overflow-auto rounded bg-background p-2 text-xs">
{`# In the bridge-agent folder:
LOVABLE_AGENT_TOKEN=${newToken.token} \\
LOVABLE_API_BASE=${apiBase} \\
node agent.mjs`}
            </pre>
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Paired agents</h3>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agents paired yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {data.map((a) => {
              const online = a.last_seen && Date.now() - new Date(a.last_seen).getTime() < 60_000;
              return (
                <li key={a.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`h-4 w-4 ${online ? "text-emerald-500" : "text-muted-foreground"}`} />
                    <span className="text-sm font-medium">{a.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {a.last_seen ? `Last seen: ${new Date(a.last_seen).toLocaleString()}` : "never"}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => remove(a.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
