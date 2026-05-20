import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  FileText,
  Layers,
  PlayCircle,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { getTemplate, updateTemplateVariables } from "@/lib/workspace.functions";
import { getTemplateBrandPrefill } from "@/lib/brand.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CreateVariationsTab } from "@/components/CreateVariationsTab";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/templates/$templateId")({
  component: TemplateDetailPage,
});

type Variable = {
  name: string;
  label?: string;
  type: "text" | "image" | "color" | "list" | string;
  multiline?: boolean;
  placeholder?: string;
  layer?: string;
  extracted?: boolean;
};

const engineMeta: Record<
  string,
  { label: string; mode: string; cls: string }
> = {
  illustrator: {
    label: "Adobe Illustrator",
    mode: "Local bridge agent",
    cls: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
  },
  indesign: {
    label: "Adobe InDesign",
    mode: "Local bridge agent",
    cls: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/30",
  },
  figma: {
    label: "Figma",
    mode: "Cloud API",
    cls: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
  },
  canva: {
    label: "Canva",
    mode: "Cloud API",
    cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  },
};

function TemplateDetailPage() {
  const { templateId } = Route.useParams();
  const fetchTemplate = useServerFn(getTemplate);
  const updateVarsFn = useServerFn(updateTemplateVariables);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["template", templateId],
    queryFn: () => fetchTemplate({ data: { id: templateId } }),
  });
  const brandPrefillFn = useServerFn(getTemplateBrandPrefill);
  const { data: brand } = useQuery({
    queryKey: ["template-brand", templateId],
    queryFn: () => brandPrefillFn({ data: { templateId } }),
  });

  const variables: Variable[] = useMemo(() => {
    const v = data?.template?.variables;
    return Array.isArray(v) ? (v as unknown as Variable[]) : [];
  }, [data]);

  const [editVars, setEditVars] = useState<Variable[]>([]);
  const [savingVars, setSavingVars] = useState(false);
  useEffect(() => { setEditVars(variables); }, [variables]);

  const varsDirty = useMemo(
    () => JSON.stringify(editVars) !== JSON.stringify(variables),
    [editVars, variables],
  );

  const saveVars = async () => {
    // Basic client-side validation: names required and unique
    const names = editVars.map((v) => v.name.trim());
    if (names.some((n) => !n)) return toast.error("Each field needs a name");
    if (new Set(names).size !== names.length) return toast.error("Field names must be unique");
    setSavingVars(true);
    try {
      await updateVarsFn({
        data: {
          id: templateId,
          variables: editVars.map((v) => ({
            name: v.name.trim(),
            label: v.label?.trim() || undefined,
            type: (v.type as "text" | "image" | "color" | "list"),
            layer: v.layer?.trim() || undefined,
          })),
        },
      });
      toast.success("Fields saved");
      qc.invalidateQueries({ queryKey: ["template", templateId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingVars(false);
    }
  };

  if (isLoading)
    return <div className="p-8 text-sm text-muted-foreground">Loading template…</div>;
  if (!data?.template)
    return <div className="p-8 text-sm text-muted-foreground">Template not found.</div>;

  const tpl = data.template;
  const engine = engineMeta[tpl.engine] ?? {
    label: tpl.engine,
    mode: "Unknown",
    cls: "bg-muted",
  };
  const isBridge = tpl.source_ref?.startsWith("bridge://");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Link
        to="/library"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Library
      </Link>

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className={`mb-2 border ${engine.cls}`}>
            {engine.label} · {engine.mode}
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight">{tpl.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            US Letter (8.5×11″) · {variables.length} editable fields · source{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{tpl.source_ref}</code>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <a href={tpl.preview_url ?? "#"} target="_blank" rel="noreferrer">
              <FileText className="h-4 w-4" /> Open preview
            </a>
          </Button>
          {data.bridge?.required && (
            <Badge variant={data.bridge.isLiveAgent ? "default" : "outline"}>
              {data.bridge.isLiveAgent
                ? `Agent online${data.bridge.agentName ? ` · ${data.bridge.agentName}` : ""}`
                : "Agent offline"}
            </Badge>
          )}
        </div>
      </header>

      {isBridge && (
        <div className="mb-4 rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={data.bridge?.isLiveAgent ? "default" : "outline"}>
              {data.bridge?.isLiveAgent ? "Live bridge connected" : "Waiting for bridge agent"}
            </Badge>
            {data.bridge?.lastSeen && (
              <span className="text-xs text-muted-foreground">
                Last seen {new Date(data.bridge.lastSeen).toLocaleString()}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {data.bridge?.queuedJobs ?? 0} queued · {data.bridge?.runningJobs ?? 0} running
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Fill the Create tab below, then dispatch from there. For this template, jobs stay queued until your local Illustrator bridge comes online and claims them.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {tpl.preview_url && (
          <div className="overflow-hidden rounded-lg border bg-muted/30 shadow-sm">
            <img
              src={tpl.preview_url}
              alt={tpl.name}
              className="max-h-[280px] w-full object-contain"
            />
          </div>
        )}

        <Tabs defaultValue="create">
          <TabsList>
            <TabsTrigger value="create">
              <Wand2 className="mr-1 h-3.5 w-3.5" /> Create
            </TabsTrigger>
            <TabsTrigger value="variations">
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Variations ({data.outputs.length})
            </TabsTrigger>
            <TabsTrigger value="fields">
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Fields ({variables.length})
            </TabsTrigger>
            <TabsTrigger value="layers">
              <Layers className="mr-1 h-3.5 w-3.5" /> Layers
            </TabsTrigger>
            <TabsTrigger value="runs">
              <PlayCircle className="mr-1 h-3.5 w-3.5" /> Runs ({data.jobs.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="mt-4">
            <CreateVariationsTab
              templateId={tpl.id}
              templateName={tpl.name}
              variables={variables}
              defaultEngines={[tpl.engine]}
              autoOpenSingleResult
              brandPrefill={brand?.prefill}
              brandSourceLabel={
                brand?.source
                  ? [brand.source.productName, brand.source.companyName].filter(Boolean).join(" / ") || null
                  : null
              }
            />
            {isBridge && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                Bridge URL: <code>{tpl.source_ref}</code>. Your paired agent on this
                workspace will receive each job and render it locally in {engine.label}.
              </p>
            )}
          </TabsContent>

          <TabsContent value="variations" className="mt-4">
            {data.outputs.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                <Wand2 className="mx-auto mb-2 h-6 w-6 opacity-50" />
                No variations yet. Use the <strong>Create</strong> tab to chat with the
                agent, fill the form, or upload a CSV.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {data.outputs.map((o) => {
                  const job = data.jobs.find((j) => j.id === o.job_id);
                  return (
                    <a
                      key={o.id}
                      href={o.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group overflow-hidden rounded-lg border bg-card transition hover:shadow-md"
                    >
                      <div className="aspect-[3/4] overflow-hidden bg-muted">
                        <img
                          src={o.url}
                          alt="variation"
                          className="h-full w-full object-cover transition group-hover:scale-105"
                        />
                      </div>
                      <div className="p-2">
                        <div className="truncate text-xs font-medium">
                          {(job?.variables as Record<string, string> | null)?.case_study_title ??
                            (job?.variables as Record<string, string> | null)?.headline ??
                            "Untitled variation"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {job?.engine} · {new Date(o.created_at).toLocaleString()}
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="fields" className="mt-4">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Each row maps to a named text or placement frame. The bridge agent swaps these on render.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setEditVars((prev) => [
                          ...prev,
                          { name: `field_${prev.length + 1}`, label: "", type: "text" },
                        ])
                      }
                    >
                      <Plus className="h-3.5 w-3.5" /> Add field
                    </Button>
                    <Button size="sm" onClick={saveVars} disabled={!varsDirty || savingVars}>
                      <Save className="h-3.5 w-3.5" /> {savingVars ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
                {editVars.length === 0 ? (
                  <p className="rounded border border-dashed p-6 text-center text-xs text-muted-foreground">
                    No fields yet. Add one to make this template usable.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {editVars.map((v, i) => (
                      <li
                        key={i}
                        className="grid grid-cols-[1fr_1fr_140px_140px_auto] items-center gap-2 rounded border bg-card/50 p-2"
                      >
                        <Input
                          value={v.name}
                          placeholder="variable_name"
                          onChange={(e) =>
                            setEditVars((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                            )
                          }
                          className="h-8 font-mono text-xs"
                        />
                        <Input
                          value={v.label ?? ""}
                          placeholder="Display label"
                          onChange={(e) =>
                            setEditVars((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                            )
                          }
                          className="h-8 text-xs"
                        />
                        <Select
                          value={v.type}
                          onValueChange={(val) =>
                            setEditVars((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, type: val as Variable["type"] } : x,
                              ),
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">text</SelectItem>
                            <SelectItem value="image">image</SelectItem>
                            <SelectItem value="color">color</SelectItem>
                            <SelectItem value="list">list</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={v.layer ?? ""}
                          placeholder="Layer (optional)"
                          onChange={(e) =>
                            setEditVars((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, layer: e.target.value } : x)),
                            )
                          }
                          className="h-8 text-xs"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() =>
                            setEditVars((prev) => prev.filter((_, j) => j !== i))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="layers" className="mt-4">
            <Card>
              <CardContent className="space-y-1 p-4 text-sm">
                {[
                  "00_GUIDES_LOCKED","01_BACKGROUND","02_IMAGES","03_GRAPHICS",
                  "04_TEXT","05_LOGOS","06_FOOTER","99_NOTES","NO_TEXT_ZONE_CURVE",
                ].map((l) => (
                  <div key={l} className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-muted/50">
                    <code className="text-xs">{l}</code>
                    <Badge variant="outline" className="text-[10px]">
                      {l.startsWith("00") || l === "NO_TEXT_ZONE_CURVE" ? "locked" : "editable"}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="runs" className="mt-4">
            {data.jobs.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No runs yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.jobs.map((j) => {
                  const outs = data.outputs.filter((o) => o.job_id === j.id);
                  return (
                    <li key={j.id} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm">
                      <div>
                        <div className="font-medium capitalize">
                          {j.status} · {j.engine}
                          {(j as { row_label?: string | null }).row_label
                            ? ` · ${(j as { row_label?: string | null }).row_label}`
                            : ""}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(j.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {outs.map((o) => (
                          <a key={o.id} href={o.url} target="_blank" rel="noreferrer"
                            className="rounded border px-2 py-0.5 text-xs hover:bg-accent">
                            {o.kind}
                          </a>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
