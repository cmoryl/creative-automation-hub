import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listOutputs } from "@/lib/workspace.functions";
import { FileStack } from "lucide-react";

export const Route = createFileRoute("/_authenticated/outputs")({
  component: OutputsPage,
});

function OutputsPage() {
  const fetchOutputs = useServerFn(listOutputs);
  const { data = [], isLoading } = useQuery({
    queryKey: ["outputs"],
    queryFn: () => fetchOutputs(),
  });

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Output Center</h1>
        <p className="text-sm text-muted-foreground">Versioned creatives, exports, and channel bundles.</p>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <FileStack className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Outputs from your jobs will appear here.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {data.map((o) => (
            <li key={o.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium">{o.kind.toUpperCase()}</div>
                <a href={o.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                  {o.url}
                </a>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(o.created_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
