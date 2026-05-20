import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listTemplates } from "@/lib/workspace.functions";
import { saveFigmaToken, importFigmaTemplate } from "@/lib/figma.functions";
import { LayoutTemplate, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";
import { toast } from "sonner";

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
  const saveTokenFn = useServerFn(saveFigmaToken);
  const importFn = useServerFn(importFigmaTemplate);
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => fetchTemplates(),
  });

  const [open, setOpen] = useState(false);
  const [pat, setPat] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const doImport = async () => {
    if (!fileUrl.trim()) return;
    setBusy(true);
    try {
      if (pat.trim()) await saveTokenFn({ data: { token: pat.trim() } });
      await importFn({ data: { fileUrl: fileUrl.trim() } });
      toast.success("Template imported");
      setOpen(false);
      setFileUrl("");
      setPat("");
      qc.invalidateQueries({ queryKey: ["templates"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Template Registry</h1>
          <p className="text-sm text-muted-foreground">
            Canva, Figma, Illustrator and InDesign templates available to this workspace.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> Import from Figma</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Import Figma template</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">Figma personal access token</label>
                <Input
                  type="password"
                  placeholder="figd_..."
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Stored once per workspace. Get one at figma.com → Settings → Personal access tokens.
                </p>
              </div>
              <div>
                <label className="text-xs font-medium">Figma file URL</label>
                <Input
                  placeholder="https://www.figma.com/design/abc123/My-Template"
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                />
              </div>
              <Button onClick={doImport} disabled={busy || !fileUrl.trim()} className="w-full">
                {busy ? "Importing…" : "Import"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <LayoutTemplate className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No templates yet. Import one from Figma — or pair a local agent to register Illustrator/InDesign templates.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-3">
          {data.map((t) => (
            <li key={t.id}>
              <Link
                to="/templates/$templateId"
                params={{ templateId: t.id }}
                className="block rounded-lg border bg-card p-4 transition hover:border-primary hover:shadow-md"
              >
                {t.preview_url && (
                  <img src={t.preview_url} alt={t.name} className="mb-3 aspect-video w-full rounded object-cover" />
                )}
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{t.name}</h3>
                  <span className={`rounded px-2 py-0.5 text-xs ${engineColor[t.engine] ?? "bg-muted"}`}>
                    {t.engine}
                  </span>
                </div>
                {t.source_ref && (
                  <p className="mt-2 truncate text-xs text-muted-foreground">{t.source_ref}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
