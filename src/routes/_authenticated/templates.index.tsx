import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listTemplates,
  renameTemplate,
  deleteTemplate,
  duplicateTemplate,
} from "@/lib/workspace.functions";
import { saveFigmaToken, importFigmaTemplate } from "@/lib/figma.functions";
import { LayoutTemplate, Plus, MoreVertical, Pencil, Trash2, Search, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/templates/")({
  component: TemplatesPage,
});

const engineColor: Record<string, string> = {
  canva: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  figma: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  illustrator: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  indesign: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
};

const ENGINES = ["all", "illustrator", "indesign", "figma", "canva", "claude"] as const;
type EngineFilter = (typeof ENGINES)[number];

function TemplatesPage() {
  const fetchTemplates = useServerFn(listTemplates);
  const saveTokenFn = useServerFn(saveFigmaToken);
  const importFn = useServerFn(importFigmaTemplate);
  const renameFn = useServerFn(renameTemplate);
  const deleteFn = useServerFn(deleteTemplate);
  const duplicateFn = useServerFn(duplicateTemplate);
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => fetchTemplates(),
  });

  const [open, setOpen] = useState(false);
  const [pat, setPat] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [engineFilter, setEngineFilter] = useState<EngineFilter>("all");
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((t) => {
      if (engineFilter !== "all" && t.engine !== engineFilter) return false;
      if (q && !t.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, engineFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.length };
    data.forEach((t) => { c[t.engine] = (c[t.engine] ?? 0) + 1; });
    return c;
  }, [data]);

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

  const doRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await renameFn({ data: { id: renameTarget.id, name: renameValue.trim() } });
      toast.success("Renamed");
      setRenameTarget(null);
      qc.invalidateQueries({ queryKey: ["templates"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteFn({ data: { id: deleteTarget.id } });
      toast.success(`Deleted “${deleteTarget.name}”`);
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["templates"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Template Registry</h1>
          <p className="text-sm text-muted-foreground">
            Canva, Figma, Illustrator and InDesign templates available to this workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/templates/batch">Batch dispatch</Link>
          </Button>
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
        </div>
      </header>

      {/* Search + engine filter */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {ENGINES.map((e) => (
            <Button
              key={e}
              size="sm"
              variant={engineFilter === e ? "default" : "outline"}
              onClick={() => setEngineFilter(e)}
            >
              {e} <span className="ml-1.5 opacity-60">{counts[e] ?? 0}</span>
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <LayoutTemplate className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {data.length === 0
              ? "No templates yet. Import one from Figma — or pair a local agent to register Illustrator/InDesign templates."
              : "No templates match your search."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-3">
          {filtered.map((t) => (
            <li key={t.id} className="group relative">
              <Link
                to="/templates/$templateId"
                params={{ templateId: t.id }}
                className="block rounded-lg border bg-card p-4 transition hover:border-primary hover:shadow-md"
              >
                {t.preview_url && (
                  <img src={t.preview_url} alt={t.name} className="mb-3 aspect-video w-full rounded object-cover" />
                )}
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate font-medium">{t.name}</h3>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${engineColor[t.engine] ?? "bg-muted"}`}>
                    {t.engine}
                  </span>
                </div>
                {t.source_ref && (
                  <p className="mt-2 truncate text-xs text-muted-foreground">{t.source_ref}</p>
                )}
              </Link>
              <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="secondary" className="h-7 w-7" onClick={(e) => e.preventDefault()}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        setRenameTarget({ id: t.id, name: t.name });
                        setRenameValue(t.name);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={async () => {
                        try {
                          await duplicateFn({ data: { id: t.id } });
                          toast.success(`Duplicated “${t.name}”`);
                          qc.invalidateQueries({ queryKey: ["templates"] });
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Duplicate failed");
                        }
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" /> Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setDeleteTarget({ id: t.id, name: t.name })}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doRename()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
              <Button onClick={doRename} disabled={!renameValue.trim()}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <strong>{deleteTarget?.name}</strong> from the workspace registry.
              Existing renders and outputs are kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
