import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listOutputs } from "@/lib/workspace.functions";
import { FileStack } from "lucide-react";
import { ShareButton } from "@/components/ShareButton";
import { OutputComments } from "@/components/OutputComments";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";

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
        <ul className="space-y-2">
          {data.map((o) => (
            <li key={o.id} className="rounded-lg border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{o.kind.toUpperCase()}</div>
                  <a
                    href={o.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs text-primary hover:underline"
                  >
                    {o.url}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{new Date(o.created_at).toLocaleString()}</span>
                  <ShareButton kind="output" outputId={o.id} />
                </div>
              </div>
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="ml-2 mb-2">
                    Comments
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-4 pb-4">
                  <OutputComments outputId={o.id} />
                </CollapsibleContent>
              </Collapsible>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
