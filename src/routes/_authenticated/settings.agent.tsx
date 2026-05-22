import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listAgentsWithStatus } from "@/lib/agent-status.functions";
import { createAgentPairing, deleteAgentPairing } from "@/lib/agent.functions";
import { Settings, Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgentStatusCard } from "@/components/AgentStatusCard";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/agent")({
  component: AgentSettings,
});

function AgentSettings() {
  const fetchAgents = useServerFn(listAgentsWithStatus);
  const createFn = useServerFn(createAgentPairing);
  const deleteFn = useServerFn(deleteAgentPairing);
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["agents-with-status"],
    queryFn: () => fetchAgents(),
    refetchInterval: 15_000,
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
      qc.invalidateQueries({ queryKey: ["agents-with-status"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const remove = async (id: string) => {
    await deleteFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["agents-with-status"] });
  };

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
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
          <Input placeholder="Agent name (e.g. Studio Mac)" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={create}><Plus className="h-4 w-4" /> Create token</Button>
        </div>

        {newToken && (
          <NewTokenPanel
            token={newToken.token}
            apiBase={apiBase}
            agentsOnline={data.filter((a) => a.online).length}
          />
        )}
      </div>

      <div className="mt-8">
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Paired agents</h3>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agents paired yet.</p>
        ) : (
          <div className="grid gap-3">
            {data.map((a) => (
              <AgentStatusCard key={a.id} agent={a} onRemove={remove} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
