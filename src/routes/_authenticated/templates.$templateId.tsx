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
import { getTemplateBrandPrefill, listCompanies, assignTemplateBrand } from "@/lib/brand.functions";
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
import { TemplateAvailabilityDetail } from "@/components/TemplateAvailabilityDetail";
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
  page?: number;
};

type TemplatePage = {
  name?: string;
  width?: number;
  height?: number;
  unit?: string;
  kind?: "artboard" | "page" | string;
  artboard_index?: number;
  page_index?: number;
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
  claude: {
    label: "Claude",
    mode: "AI copy generation",
    cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
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
  const listCompaniesFn = useServerFn(listCompanies);
  const { data: companies } = useQuery({
    queryKey: ["companies-for-template-assign"],
    queryFn: () => listCompaniesFn(),
  });
  const assignBrandFn = useServerFn(assignTemplateBrand);
  const [assigning, setAssigning] = useState(false);
  const assignedCompanyId = brand?.source?.companyId ?? null;
  const assignedProductId = brand?.source?.productId ?? null;
  const productOptions = useMemo(() => {
    const c = (companies ?? []).find((x) => x.id === assignedCompanyId);
    if (!c) return [] as Array<{ id: string; name: string; parent?: string | null }>;
    const flat: Array<{ id: string; name: string; parent?: string | null }> = [];
    for (const p of c.products ?? []) {
      flat.push({ id: p.id, name: p.name });
      for (const sp of p.subProducts ?? []) flat.push({ id: sp.id, name: `${p.name} → ${sp.name}` });
    }
    return flat;
  }, [companies, assignedCompanyId]);

  const handleAssign = async (companyId: string | null, productId: string | null) => {
    setAssigning(true);
    try {
      await assignBrandFn({ data: { templateId, companyId, productId } });
      toast.success("Template scoped");
      qc.invalidateQueries({ queryKey: ["template-brand", templateId] });
      qc.invalidateQueries({ queryKey: ["template", templateId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign");
    } finally {
      setAssigning(false);
    }
  };

  const variables: Variable[] = useMemo(() => {
    const v = data?.template?.variables;
    return Array.isArray(v) ? (v as unknown as Variable[]) : [];
  }, [data]);

  const pages: TemplatePage[] = useMemo(() => {
    const p = (data?.template as { pages?: unknown })?.pages;
    return Array.isArray(p) ? (p as TemplatePage[]) : [];
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
            page: typeof v.page === "number" && v.page > 0 ? v.page : undefined,
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

      {/* Hero: preview + metadata side by side */}
      <section className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-muted/40 to-muted/10 shadow-sm">
          {tpl.preview_url ? (
            <img
              src={tpl.preview_url}
              alt={tpl.name}
              className="aspect-[8.5/11] w-full object-contain p-4"
            />
          ) : (
            <div className="flex aspect-[8.5/11] w-full items-center justify-center text-xs text-muted-foreground">
              No preview
            </div>
          )}
          {tpl.preview_url && (
            <a
              href={tpl.preview_url}
              target="_blank"
              rel="noreferrer"
              className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border bg-background/90 px-2.5 py-1 text-xs shadow-sm backdrop-blur transition hover:bg-background"
            >
              <FileText className="h-3 w-3" /> Open
            </a>
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`border ${engine.cls}`}>{engine.label}</Badge>
            <Badge variant="outline" className="font-normal">{engine.mode}</Badge>
            {data.bridge?.required && (
              <Badge variant={data.bridge.isLiveAgent ? "default" : "outline"}>
                <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${data.bridge.isLiveAgent ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"}`} />
                {data.bridge.isLiveAgent
                  ? `Agent online${data.bridge.agentName ? ` · ${data.bridge.agentName}` : ""}`
                  : "Agent offline"}
              </Badge>
            )}
          </div>

          <h1 className="mt-3 text-3xl font-bold tracking-tight">{tpl.name}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            US Letter (8.5×11″) · source{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{tpl.source_ref}</code>
          </p>

          {/* Brand scoping — assign this template to a company + optional product/sub-brand */}
          <div className="mt-5 rounded-lg border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Scope
              </div>
              {(assignedCompanyId || assignedProductId) && (
                <button
                  type="button"
                  disabled={assigning}
                  onClick={() => handleAssign(null, null)}
                  className="text-[11px] text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                value={assignedCompanyId ?? "__none"}
                onValueChange={(v) => handleAssign(v === "__none" ? null : v, null)}
                disabled={assigning}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Company (workspace-wide)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No company (workspace-wide)</SelectItem>
                  {(companies ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={assignedProductId ?? "__none"}
                onValueChange={(v) =>
                  handleAssign(assignedCompanyId, v === "__none" ? null : v)
                }
                disabled={assigning || !assignedCompanyId || productOptions.length === 0}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue
                    placeholder={
                      !assignedCompanyId
                        ? "Pick a company first"
                        : productOptions.length === 0
                          ? "No products"
                          : "Product / sub-brand (optional)"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">All products (company-wide)</SelectItem>
                  {productOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {brand?.source && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Brand kit autofills from{" "}
                <strong>
                  {[brand.source.productName, brand.source.companyName]
                    .filter(Boolean)
                    .join(" / ") || "this scope"}
                </strong>
                . Fields, colors, and logo carry into every render.
              </p>
            )}
          </div>

          {/* Stat tiles */}
          <div className="mt-5 grid grid-cols-4 gap-2">
            {[
              { label: pages.length > 1 ? "Pages" : "Page", value: pages.length || 1 },
              { label: "Fields", value: variables.length },
              { label: "Variations", value: data.outputs.length },
              { label: "Runs", value: data.jobs.length },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border bg-card px-3 py-2.5">
                <div className="text-2xl font-semibold leading-none">{s.value}</div>
                <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {isBridge && (
            <div className="mt-5 rounded-lg border bg-muted/30 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={data.bridge?.isLiveAgent ? "default" : "outline"} className="text-[10px]">
                  {data.bridge?.isLiveAgent ? "Live bridge connected" : "Waiting for bridge"}
                </Badge>
                {data.bridge?.lastSeen && (
                  <span className="text-muted-foreground">
                    Last seen {new Date(data.bridge.lastSeen).toLocaleString()}
                  </span>
                )}
                <span className="text-muted-foreground">
                  {data.bridge?.queuedJobs ?? 0} queued · {data.bridge?.runningJobs ?? 0} running
                </span>
              </div>
              <p className="mt-1.5 text-muted-foreground">
                Jobs stay queued until your local Illustrator bridge comes online and claims them.
              </p>
            </div>
          )}
        </div>
      </section>

      <div className="space-y-4">


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
            {pages.length > 0 && (
              <TabsTrigger value="pages">
                <FileText className="mr-1 h-3.5 w-3.5" /> Pages ({pages.length})
              </TabsTrigger>
            )}
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
              pages={pages}
              defaultEngines={[tpl.engine]}
              autoOpenSingleResult
              brandPrefill={brand?.prefill}
              brandSourceLabel={
                brand?.source
                  ? [brand.source.productName, brand.source.companyName].filter(Boolean).join(" / ") || null
                  : null
              }
              companyId={brand?.source?.companyId ?? null}
              productId={brand?.source?.productId ?? null}
              engine={tpl.engine}
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
                        className={
                          pages.length > 1
                            ? "grid grid-cols-[1fr_1fr_120px_140px_120px_auto] items-center gap-2 rounded border bg-card/50 p-2"
                            : "grid grid-cols-[1fr_1fr_140px_140px_auto] items-center gap-2 rounded border bg-card/50 p-2"
                        }
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
                        {pages.length > 1 && (
                          <Select
                            value={v.page ? String(v.page) : "auto"}
                            onValueChange={(val) =>
                              setEditVars((prev) =>
                                prev.map((x, j) =>
                                  j === i
                                    ? { ...x, page: val === "auto" ? undefined : Number(val) }
                                    : x,
                                ),
                              )
                            }
                          >
                            <SelectTrigger className="h-8 text-xs" title="Bind this field to a specific page/artboard">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">Auto</SelectItem>
                              {pages.map((p, idx) => (
                                <SelectItem key={idx} value={String(idx + 1)}>
                                  {String(idx + 1).padStart(2, "0")} · {p.name ?? `Page ${idx + 1}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
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

          {pages.length > 0 && (
            <TabsContent value="pages" className="mt-4">
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Multi-page layout. Each render produces one preview + one PDF per page,
                      plus a combined master PDF and a packaged ZIP.
                    </p>
                    <Badge variant="outline" className="text-[10px]">
                      {pages.length} {pages.length === 1 ? "page" : "pages"}
                    </Badge>
                  </div>
                  <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {pages.map((p, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 rounded-lg border bg-card/60 p-3"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
                          {String(i + 1).padStart(2, "0")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {p.name ?? `Page ${i + 1}`}
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {p.kind === "artboard" ? "Artboard" : "Page"}
                            {p.width && p.height
                              ? ` · ${p.width}×${p.height}${p.unit ?? ""}`
                              : ""}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </TabsContent>
          )}

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
