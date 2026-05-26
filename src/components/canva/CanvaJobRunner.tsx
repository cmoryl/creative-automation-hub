import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listCanvaTemplates, runCanvaJob } from "@/lib/canva.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Sparkles, ImageIcon } from "lucide-react";
import { toast } from "sonner";

type Variable = { name: string; label?: string; type?: string; multiline?: boolean };

export function CanvaJobRunner({ projectId }: { projectId: string }) {
  const listFn = useServerFn(listCanvaTemplates);
  const runFn = useServerFn(runCanvaJob);
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [format, setFormat] = useState<"png" | "jpg" | "pdf" | "mp4">("png");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["canva-templates"],
    queryFn: () => listFn(),
    enabled: open,
  });

  const selected = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );
  const vars = (selected?.variables ?? []) as Variable[];

  const onPick = (id: string) => {
    setTemplateId(id);
    setValues({});
    const t = templates.find((x) => x.id === id);
    if (t && !title) setTitle(t.name);
  };

  const run = async () => {
    if (!templateId) return;
    setBusy(true);
    try {
      await runFn({
        data: {
          projectId,
          templateId,
          format,
          title: title.trim() || undefined,
          variables: values,
        },
      });
      toast.success("Canva render queued");
      setOpen(false);
      setTemplateId("");
      setValues({});
      setTitle("");
      qc.invalidateQueries({ queryKey: ["jobs", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Canva render failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Sparkles className="h-3 w-3 text-blue-500" /> Canva
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Run with Canva</DialogTitle>
          <DialogDescription>
            Pick a Canva brand template, fill its variables, and we'll autofill + export.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading templates…</p>
        ) : templates.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No Canva templates imported yet. Open Settings → Integrations → Canva to sync brand templates.
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block text-xs">Template</Label>
              <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onPick(t.id)}
                    className={`flex items-center gap-2 rounded border p-2 text-left transition hover:border-primary ${
                      templateId === t.id ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    {t.preview_url ? (
                      <img
                        src={t.preview_url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <span className="truncate text-xs">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {selected && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1 block text-xs">Design title</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={selected.name}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Export format</Label>
                    <Select value={format} onValueChange={(v) => setFormat(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="png">PNG</SelectItem>
                        <SelectItem value="jpg">JPG</SelectItem>
                        <SelectItem value="pdf">PDF</SelectItem>
                        <SelectItem value="mp4">MP4 (video)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {vars.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    This template has no dataset fields. It will be exported as-is.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-xs">Variables</Label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {vars.map((v) => (
                        <div key={v.name}>
                          <Label className="mb-1 block text-[11px] text-muted-foreground">
                            {v.label ?? v.name}
                            {v.type === "image" ? " (image URL or asset id)" : ""}
                          </Label>
                          {v.multiline ? (
                            <Textarea
                              rows={2}
                              value={values[v.name] ?? ""}
                              onChange={(e) =>
                                setValues((s) => ({ ...s, [v.name]: e.target.value }))
                              }
                            />
                          ) : (
                            <Input
                              value={values[v.name] ?? ""}
                              onChange={(e) =>
                                setValues((s) => ({ ...s, [v.name]: e.target.value }))
                              }
                              placeholder={v.type === "image" ? "https://… or asset uuid" : ""}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={run} disabled={busy}>
                    <Play className="h-3 w-3" /> {busy ? "Running…" : "Run"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
