import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  Layers,
  PlayCircle,
  Plus,
  Send,
  Sparkles,
  Wand2,
} from "lucide-react";
import { getTemplate, dispatchTemplateJob } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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
  const dispatchFn = useServerFn(dispatchTemplateJob);
  const qc = useQueryClient();
  const nav = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["template", templateId],
    queryFn: () => fetchTemplate({ data: { id: templateId } }),
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);

  const variables: Variable[] = useMemo(() => {
    const v = data?.template?.variables;
    return Array.isArray(v) ? (v as unknown as Variable[]) : [];
  }, [data]);

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

  const handleDispatch = async (opts?: { stayOnPage?: boolean }) => {
    setBusy(true);
    try {
      const res = await dispatchFn({
        data: {
          templateId: tpl.id,
          variables: values,
          briefSummary: brief || `Variation of ${tpl.name}`,
        },
      });
      toast.success(
        res.mocked
          ? "Variation created — preview ready (mocked, no live bridge)"
          : "Variation queued — bridge will render it",
      );
      qc.invalidateQueries({ queryKey: ["template", templateId] });
      if (opts?.stayOnPage) {
        setValues({});
        setBrief("");
      } else {
        nav({ to: "/projects/$projectId", params: { projectId: res.projectId } });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dispatch failed");
    } finally {
      setBusy(false);
    }
  };

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
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={tpl.preview_url ?? "#"} target="_blank" rel="noreferrer">
              <FileText className="h-4 w-4" /> Open preview
            </a>
          </Button>
          <Button
            onClick={() => handleDispatch({ stayOnPage: true })}
            disabled={busy}
            variant="outline"
          >
            <Plus className="h-4 w-4" /> {busy ? "Creating…" : "Quick variation"}
          </Button>
          <Button
            onClick={() => handleDispatch()}
            disabled={busy}
            className="bg-gradient-to-r from-primary to-primary/80"
          >
            <Wand2 className="h-4 w-4" /> Create & open
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* LEFT — preview + tabs */}
        <div className="space-y-4">
          {tpl.preview_url && (
            <div className="overflow-hidden rounded-lg border bg-muted/30 shadow-sm">
              <img
                src={tpl.preview_url}
                alt={tpl.name}
                className="w-full object-contain"
              />
            </div>
          )}

          <Tabs defaultValue="fields">
            <TabsList>
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

            <TabsContent value="fields" className="mt-4">
              <Card>
                <CardContent className="space-y-2 p-4">
                  <p className="text-xs text-muted-foreground">
                    Auto-extracted from the .ai file — each row maps to a named text or
                    placement frame inside Illustrator. The bridge agent swaps these on
                    render.
                  </p>
                  <ul className="divide-y text-sm">
                    {variables.map((v) => (
                      <li key={v.name} className="flex items-center justify-between py-2">
                        <div>
                          <div className="font-medium">{v.label ?? v.name}</div>
                          <code className="text-[11px] text-muted-foreground">
                            {v.name}
                          </code>
                        </div>
                        <div className="flex items-center gap-2">
                          {v.layer && (
                            <Badge variant="outline" className="text-[10px]">
                              {v.layer}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px]">
                            {v.type}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="layers" className="mt-4">
              <Card>
                <CardContent className="space-y-1 p-4 text-sm">
                  {[
                    "00_GUIDES_LOCKED",
                    "01_BACKGROUND",
                    "02_IMAGES",
                    "03_GRAPHICS",
                    "04_TEXT",
                    "05_LOGOS",
                    "06_FOOTER",
                    "99_NOTES",
                    "NO_TEXT_ZONE_CURVE",
                  ].map((l) => (
                    <div
                      key={l}
                      className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-muted/50"
                    >
                      <code className="text-xs">{l}</code>
                      <Badge variant="outline" className="text-[10px]">
                        {l.startsWith("00") || l === "NO_TEXT_ZONE_CURVE"
                          ? "locked"
                          : "editable"}
                      </Badge>
                    </div>
                  ))}
                  <p className="pt-2 text-xs text-muted-foreground">
                    Parsed from the uploaded master file. The bridge respects layer order
                    and only writes into editable layers.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="runs" className="mt-4">
              {data.jobs.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No runs yet. Fill the brief on the right and send to the bridge.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.jobs.map((j) => {
                    const outs = data.outputs.filter((o) => o.job_id === j.id);
                    return (
                      <li
                        key={j.id}
                        className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm"
                      >
                        <div>
                          <div className="font-medium capitalize">{j.status}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(j.created_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {outs.map((o) => (
                            <a
                              key={o.id}
                              href={o.url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded border px-2 py-0.5 text-xs hover:bg-accent"
                            >
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

        {/* RIGHT — brief + variable form */}
        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <h2 className="text-sm font-semibold">Brief</h2>
                <p className="text-xs text-muted-foreground">
                  Plain English. Claude turns this into variables below.
                </p>
              </div>
              <Textarea
                placeholder={`e.g. "Case study for Acme Biotech on our new oncology trial workflow. Hero shot: lab tech with vial. Strong stats: 42% faster, 18 sites."`}
                rows={5}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">Variables</h2>
              {variables.map((v) => (
                <div key={v.name} className="space-y-1">
                  <label className="text-xs font-medium">
                    {v.label ?? v.name}
                    {v.layer && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({v.layer})
                      </span>
                    )}
                  </label>
                  {v.type === "color" ? (
                    <Input
                      type="color"
                      value={values[v.name] ?? "#0066cc"}
                      onChange={(e) =>
                        setValues((s) => ({ ...s, [v.name]: e.target.value }))
                      }
                    />
                  ) : v.multiline ? (
                    <Textarea
                      rows={3}
                      placeholder={v.placeholder ?? v.label ?? v.name}
                      value={values[v.name] ?? ""}
                      onChange={(e) =>
                        setValues((s) => ({ ...s, [v.name]: e.target.value }))
                      }
                    />
                  ) : (
                    <Input
                      placeholder={v.placeholder ?? v.label ?? v.name}
                      value={values[v.name] ?? ""}
                      onChange={(e) =>
                        setValues((s) => ({ ...s, [v.name]: e.target.value }))
                      }
                    />
                  )}
                </div>
              ))}
              <Button
                onClick={() => handleDispatch()}
                disabled={busy}
                className="w-full"
              >
                <Send className="h-4 w-4" /> {busy ? "Dispatching…" : "Send to bridge"}
              </Button>
              {isBridge && (
                <p className="text-[11px] text-muted-foreground">
                  Bridge URL: <code>{tpl.source_ref}</code>. Your paired agent on this
                  workspace will receive the job and render it locally in{" "}
                  {engine.label}.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
