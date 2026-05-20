import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listTemplates } from "@/lib/workspace.functions";
import { LayoutTemplate } from "lucide-react";

export const Route = createFileRoute("/_authenticated/templates")({
  component: TemplatesPage,
});

const engineColor: Record<string, string> = {
  canva: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  figma: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  illustrator: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  indesign: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
};

function TemplatesPage() {
  const fetchTemplates = useServerFn(listTemplates);
  const { data = [], isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => fetchTemplates(),
  });

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Template Registry</h1>
        <p className="text-sm text-muted-foreground">
          Canva, Figma, Illustrator and InDesign templates available to this workspace.
        </p>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <LayoutTemplate className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No templates yet. Connect Canva or Figma — or pair a local agent to import Illustrator/InDesign templates.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-3">
          {data.map((t) => (
            <li key={t.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{t.name}</h3>
                <span className={`rounded px-2 py-0.5 text-xs ${engineColor[t.engine] ?? "bg-muted"}`}>
                  {t.engine}
                </span>
              </div>
              {t.source_ref && (
                <p className="mt-2 truncate text-xs text-muted-foreground">{t.source_ref}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
