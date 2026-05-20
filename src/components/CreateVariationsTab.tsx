import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bot,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Send,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  briefAgentChat,
  createBriefUploadUrl,
  createHeroImageUploadUrl,
  parseCsvFile,
  dispatchVariations,
} from "@/lib/brief-agent.functions";
import {
  listProductAssets,
  saveProductAsset,
  generateProductImage,
} from "@/lib/product-assets.functions";

type Variable = {
  name: string;
  label?: string;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
  layer?: string;
};

type ChatMsg = { role: "user" | "assistant"; content: string };
type InputMode = "form" | "csv";
type Section = { id: string; title: string; fieldNames: string[] };

const ENGINES: { id: "illustrator" | "indesign" | "figma" | "canva"; label: string }[] = [
  { id: "illustrator", label: "Illustrator" },
  { id: "indesign", label: "InDesign" },
  { id: "figma", label: "Figma" },
  { id: "canva", label: "Canva" },
];

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/i;
const IMAGE_URL_RE = /^https?:\/\/\S+$/i;

/** Validate one field value. Returns error message or null. */
export function validateField(v: Variable, raw: string): string | null {
  const val = (raw ?? "").trim();
  const label = v.label ?? v.name;
  if (!val) return `${label} is required`;
  if (v.type === "color") {
    if (!HEX_RE.test(val)) return `${label} must be a hex color (e.g. #0E2C5C)`;
    return null;
  }
  if (v.type === "image" || /image|logo|photo|hero/i.test(v.name)) {
    if (!IMAGE_URL_RE.test(val)) return `${label} must be an image URL (https://…)`;
    return null;
  }
  if (/email/i.test(v.name)) {
    if (!EMAIL_RE.test(val)) return `${label} must be a valid email`;
    if (val.length > 255) return `${label} is too long`;
    return null;
  }
  if (/url|website|link/i.test(v.name)) {
    if (!URL_RE.test(val)) return `${label} must be a valid URL or domain`;
    if (val.length > 500) return `${label} is too long`;
    return null;
  }
  const max = v.multiline || /challenge|solution|results|quote|body|description/i.test(v.name) ? 4000 : 200;
  if (val.length > max) return `${label} must be ≤ ${max} characters`;
  return null;
}

export function validateAll(
  variables: Variable[],
  values: Record<string, string>,
): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const v of variables) {
    const e = validateField(v, values[v.name] ?? "");
    if (e) errs[v.name] = e;
  }
  return errs;
}

export type { Variable };

export function CreateVariationsTab({
  templateId,
  templateName,
  variables,
  defaultEngines,
  autoOpenSingleResult = false,
  brandPrefill,
  brandSourceLabel,
  companyId,
  productId,
  engine,
}: {
  templateId: string;
  templateName: string;
  variables: Variable[];
  defaultEngines?: string[];
  autoOpenSingleResult?: boolean;
  brandPrefill?: Record<string, string>;
  brandSourceLabel?: string | null;
  companyId?: string | null;
  productId?: string | null;
  engine?: string;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const chatFn = useServerFn(briefAgentChat);
  const uploadUrlFn = useServerFn(createBriefUploadUrl);
  const parseFn = useServerFn(parseCsvFile);
  const dispatchFn = useServerFn(dispatchVariations);

  const [mode, setMode] = useState<InputMode>("form");
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(brandPrefill ?? {}) }));
  const [, setSections] = useState<Section[]>([]);
  const [engines, setEngines] = useState<Set<string>>(
    new Set(defaultEngines?.length ? defaultEngines : ["illustrator"]),
  );
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content: `Hi! I'll help you build variations of "${templateName}". Tell me what you need — one polished piece, or many at once? I can guide you through a form, a step-by-step section walk-through, or take a CSV.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [activityLog, setActivityLog] = useState<
    { ts: number; text: string; kind: "info" | "ok" | "err" }[]
  >([]);
  const [lastResult, setLastResult] = useState<{
    created: { projectId: string; jobIds: string[]; label: string }[];
    hasLiveAgent: boolean;
    engines: string[];
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [csvRowErrors, setCsvRowErrors] = useState<{ row: number; field: string; message: string }[]>([]);

  const logActivity = (text: string, kind: "info" | "ok" | "err" = "info") =>
    setActivityLog((l) => [...l, { ts: Date.now(), text, kind }]);


  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" });
  }, [messages, activityLog]);

  // Subscribe to live job progress + status for jobs we just dispatched.
  useEffect(() => {
    if (!lastResult) return;
    const jobIds = lastResult.created.flatMap((c) => c.jobIds);
    if (!jobIds.length) return;

    const channel = supabase
      .channel(`jobs-progress-${jobIds[0]}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "jobs",
          filter: `id=in.(${jobIds.join(",")})`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            status: string;
            engine: string;
            row_label: string | null;
            brief: { progress?: { stage: string; percent: number; message?: string | null } } | null;
            error: string | null;
          };
          const label = row.row_label ?? "variation";
          if (row.status === "completed") {
            logActivity(`✓ ${row.engine} · ${label} — completed`, "ok");
          } else if (row.status === "failed") {
            logActivity(`✗ ${row.engine} · ${label} — ${row.error ?? "failed"}`, "err");
          } else if (row.brief?.progress) {
            const p = row.brief.progress;
            logActivity(
              `${row.engine} · ${label} — ${p.stage} ${p.percent}%${p.message ? ` (${p.message})` : ""}`,
            );
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [lastResult]);


  const chat = useMutation({
    mutationFn: async (text: string) => {
      const newMsgs: ChatMsg[] = [...messages, { role: "user", content: text }];
      setMessages(newMsgs);
      setInput("");
      const res = await chatFn({
        data: {
          templateName,
          variables: variables.map((v) => ({
            name: v.name,
            label: v.label,
            type: v.type,
          })),
          currentMode: mode,
          currentValues: values,
          messages: newMsgs,
        },
      });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      if (res.suggestedMode && res.suggestedMode !== "stepper") setMode(res.suggestedMode);
      if (res.prefillValues && Object.keys(res.prefillValues).length) {
        setValues((s) => ({ ...s, ...res.prefillValues }));
        toast.success(`Filled ${Object.keys(res.prefillValues).length} field(s)`);
      }
      if (res.suggestedSections?.length) setSections(res.suggestedSections);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Agent failed"),
  });

  const handleCsvUpload = async (file: File) => {
    try {
      const { path, signedUrl, token } = await uploadUrlFn({
        data: { filename: file.name },
      });
      const { error } = await supabase.storage
        .from("brief-uploads")
        .uploadToSignedUrl(path, token, file);
      if (error) throw error;
      void signedUrl;
      const parsed = await parseFn({
        data: {
          storagePath: path,
          variables: variables.map((v) => ({
            name: v.name,
            label: v.label,
            type: v.type,
          })),
        },
      });
      setCsvHeaders(parsed.headers);
      setCsvRows(parsed.rows);
      setCsvMapping(parsed.mapping);
      toast.success(`Parsed ${parsed.rows.length} rows`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const dispatch = useMutation({
    mutationFn: async () => {
      if (engines.size === 0) throw new Error("Pick at least one engine");
      setLastResult(null);
      setActivityLog([]);
      setCsvRowErrors([]);
      logActivity("Validating inputs…");
      let rows: { label: string; values: Record<string, string> }[] = [];
      if (mode === "csv") {
        if (!csvRows.length) throw new Error("Upload a CSV first");
        const rowErrs: { row: number; field: string; message: string }[] = [];
        rows = csvRows.map((r, i) => {
          const mapped: Record<string, string> = {};
          for (const v of variables) {
            const col = csvMapping[v.name];
            if (col && r[col] != null) mapped[v.name] = String(r[col]);
          }
          const errs = validateAll(variables, mapped);
          for (const [field, message] of Object.entries(errs)) {
            rowErrs.push({ row: i + 1, field, message });
          }
          return {
            label:
              mapped.case_study_title ||
              mapped.client_name ||
              mapped.headline ||
              `Row ${i + 1}`,
            values: mapped,
          };
        });
        if (rowErrs.length) {
          setCsvRowErrors(rowErrs);
          throw new Error(
            `${rowErrs.length} validation error(s) across ${new Set(rowErrs.map((e) => e.row)).size} row(s)`,
          );
        }
        logActivity(`Mapped ${rows.length} CSV rows to template fields`, "ok");
      } else {
        const errs = validateAll(variables, values);
        setErrors(errs);
        if (Object.keys(errs).length) {
          throw new Error(
            `Please fix ${Object.keys(errs).length} field error(s) before dispatching`,
          );
        }
        rows = [
          {
            label:
              values.case_study_title ||
              values.client_name ||
              values.headline ||
              "Variation",
            values,
          },
        ];
        logActivity(`Prepared 1 variation from ${mode} input`, "ok");
      }
      const engineList = Array.from(engines);
      logActivity(
        `Dispatching ${rows.length} × ${engineList.length} = ${rows.length * engineList.length} render job(s)…`,
      );
      const res = await dispatchFn({
        data: {
          templateId,
          engines: engineList as never,
          rows,
        },
      });
      return { ...res, engines: engineList };
    },
    onSuccess: (res) => {
      const totalJobs = res.created.reduce((n, c) => n + c.jobIds.length, 0);
      logActivity(
        `Created ${res.created.length} project(s) with ${totalJobs} job(s)`,
        "ok",
      );
      if (res.hasLiveAgent) {
        logActivity("Live bridge agent detected — jobs queued for rendering", "ok");
      } else {
        logActivity(
          "No live bridge agent detected — jobs are saved and waiting to be claimed",
          "info",
        );
      }
      setLastResult(res);
      toast.success(
        `Created ${res.created.length} variation(s) × ${res.engines.length} engine(s)`,
      );
      qc.invalidateQueries({ queryKey: ["template", templateId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      if (autoOpenSingleResult && res.created.length === 1) {
        navigate({
          to: "/projects/$projectId",
          params: { projectId: res.created[0].projectId },
        });
      }
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Dispatch failed";
      logActivity(msg, "err");
      toast.error(msg);
    },
  });

  const uploadHero = useServerFn(createHeroImageUploadUrl);

  const renderField = (v: Variable) => {
    const val = values[v.name] ?? "";
    const err = errors[v.name];
    const onChange = (newVal: string) => {
      setValues((s) => ({ ...s, [v.name]: newVal }));
      if (errors[v.name]) {
        setErrors((s) => {
          const n = { ...s };
          delete n[v.name];
          return n;
        });
      }
    };
    const errBorder = err ? "border-destructive focus-visible:ring-destructive" : "";
    let control: React.ReactNode;
    if (v.type === "color") {
      control = (
        <Input
          type="color"
          value={val || "#0066cc"}
          onChange={(e) => onChange(e.target.value)}
          className={errBorder}
        />
      );
    } else if (v.type === "image" || /image|logo|photo|hero/i.test(v.name)) {
      control = (
        <ImageField
          value={val}
          onChange={onChange}
          requestUpload={(filename) => uploadHero({ data: { filename } })}
          onLog={logActivity}
          companyId={companyId ?? null}
          productId={productId ?? null}
          engine={engine}
          fieldLabel={v.label ?? v.name}
        />
      );
    } else if (v.multiline || v.name.match(/challenge|solution|results|quote/i)) {
      control = (
        <Textarea
          rows={3}
          placeholder={v.placeholder ?? v.label ?? v.name}
          value={val}
          onChange={(e) => onChange(e.target.value)}
          className={errBorder}
        />
      );
    } else {
      control = (
        <Input
          placeholder={v.placeholder ?? v.label ?? v.name}
          value={val}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!err}
          className={errBorder}
        />
      );
    }
    return (
      <>
        {control}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </>
    );
  };

  return (
    <div className="space-y-3">
    {brandPrefill && Object.keys(brandPrefill).length > 0 && (
      <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span>
          Brand kit applied{brandSourceLabel ? ` from ${brandSourceLabel}` : ""} —
          pre-filled <strong>{Object.keys(brandPrefill).length}</strong> field
          {Object.keys(brandPrefill).length === 1 ? "" : "s"} (colors, logo, contact).
        </span>
      </div>
    )}
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      {/* LEFT — Chat */}
      <Card className="flex h-[600px] flex-col">
        <div className="flex items-center gap-2 border-b p-3">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Brief assistant</span>
        </div>
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`text-sm ${
                m.role === "user"
                  ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-primary-foreground"
                  : "max-w-[85%] text-foreground"
              }`}
            >
              {m.content}
            </div>
          ))}
          {chat.isPending && (
            <div className="text-sm text-muted-foreground">Thinking…</div>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) chat.mutate(input.trim());
          }}
          className="flex gap-2 border-t p-3"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell the assistant about your brief…"
            disabled={chat.isPending}
            autoFocus
          />
          <Button type="submit" size="icon" disabled={chat.isPending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>

      {/* RIGHT — Mode switcher + input */}
      <Card className="flex h-[600px] flex-col">
        <div className="flex items-center gap-1 border-b p-2">
          {(
            [
              { id: "form", icon: Sparkles, label: "Single brief" },
              { id: "csv", icon: FileSpreadsheet, label: "Bulk CSV" },
            ] as const
          ).map((m) => (
            <Button
              key={m.id}
              size="sm"
              variant={mode === m.id ? "default" : "ghost"}
              onClick={() => setMode(m.id)}
            >
              <m.icon className="h-3.5 w-3.5" /> {m.label}
            </Button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {mode === "form" && (
            <div className="space-y-3">
              {variables.map((v) => (
                <div key={v.name} className="space-y-1">
                  <label className="text-xs font-medium">
                    {v.label ?? v.name}
                  </label>
                  {renderField(v)}
                </div>
              ))}
            </div>
          )}



          {mode === "csv" && (
            <div className="space-y-3">
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center hover:bg-muted/40">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {csvRows.length
                    ? `${csvRows.length} rows loaded`
                    : "Upload a CSV"}
                </span>
                <span className="text-xs text-muted-foreground">
                  One row per variation. Headers auto-map to fields.
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) =>
                    e.target.files?.[0] && handleCsvUpload(e.target.files[0])
                  }
                />
              </label>
              {csvHeaders.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium">Column → Field mapping</div>
                  <div className="space-y-1.5">
                    {variables.map((v) => (
                      <div
                        key={v.name}
                        className="grid grid-cols-2 items-center gap-2"
                      >
                        <span className="text-xs">{v.label ?? v.name}</span>
                        <select
                          className="rounded border bg-background px-2 py-1 text-xs"
                          value={csvMapping[v.name] ?? ""}
                          onChange={(e) =>
                            setCsvMapping((m) => ({
                              ...m,
                              [v.name]: e.target.value,
                            }))
                          }
                        >
                          <option value="">— skip —</option>
                          {csvHeaders.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer: engines + dispatch */}
        <div className="space-y-2 border-t p-3">
          {mode !== "csv" && Object.keys(errors).length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              <div className="font-medium">
                {Object.keys(errors).length} field error(s) — fix before dispatching:
              </div>
              <ul className="mt-1 list-disc pl-4">
                {Object.entries(errors).slice(0, 5).map(([f, m]) => (
                  <li key={f}>{m}</li>
                ))}
                {Object.keys(errors).length > 5 && (
                  <li>+{Object.keys(errors).length - 5} more…</li>
                )}
              </ul>
            </div>
          )}
          {mode === "csv" && csvRowErrors.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              <div className="font-medium">
                {csvRowErrors.length} CSV validation error(s):
              </div>
              <ul className="mt-1 list-disc pl-4">
                {csvRowErrors.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
                {csvRowErrors.length > 10 && <li>+{csvRowErrors.length - 10} more…</li>}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Render in:</span>
            {ENGINES.map((e) => {
              const on = engines.has(e.id);
              return (
                <Badge
                  key={e.id}
                  variant={on ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => {
                    setEngines((s) => {
                      const next = new Set(s);
                      next.has(e.id) ? next.delete(e.id) : next.add(e.id);
                      return next;
                    });
                  }}
                >
                  {e.label}
                </Badge>
              );
            })}
          </div>
          <Button
            className="w-full"
            disabled={dispatch.isPending}
            onClick={() => dispatch.mutate()}
          >
            {dispatch.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}{" "}
            {dispatch.isPending
              ? "Dispatching…"
              : mode === "csv"
                ? `Dispatch ${csvRows.length} × ${engines.size} = ${csvRows.length * engines.size} files`
                : `Create variation × ${engines.size} engine(s)`}
          </Button>

          {(activityLog.length > 0 || dispatch.isPending) && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs">
              {activityLog.map((a, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-1.5 ${
                    a.kind === "err"
                      ? "text-destructive"
                      : a.kind === "ok"
                        ? "text-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {a.kind === "ok" ? (
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                  ) : a.kind === "err" ? (
                    <span className="mt-0.5">×</span>
                  ) : (
                    <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" />
                  )}
                  <span>{a.text}</span>
                </div>
              ))}
              {dispatch.isPending && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Working on the server…</span>
                </div>
              )}
            </div>
          )}

          {lastResult && !dispatch.isPending && (
            <div className="space-y-1.5 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                {lastResult.created.length} project(s) created
              </div>
              <div className="space-y-1">
                {lastResult.created.slice(0, 5).map((c) => (
                  <Link
                    key={c.projectId}
                    to="/projects/$projectId"
                    params={{ projectId: c.projectId }}
                    className="flex items-center justify-between rounded px-1.5 py-1 hover:bg-background"
                  >
                    <span className="truncate">{c.label}</span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      {c.jobIds.length} job(s)
                      <ExternalLink className="h-3 w-3" />
                    </span>
                  </Link>
                ))}
                {lastResult.created.length > 5 && (
                  <div className="px-1.5 text-muted-foreground">
                    +{lastResult.created.length - 5} more…
                  </div>
                )}
              </div>
              <Link
                to="/outputs"
                className="mt-1 flex items-center justify-center gap-1 rounded border bg-background py-1 font-medium hover:bg-muted"
              >
                View all outputs <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
      </Card>
    </div>
    </div>
  );
}

function ImageField({
  value,
  onChange,
  requestUpload,
  onLog,
  companyId,
  productId,
  engine,
  fieldLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  requestUpload: (filename: string) => Promise<{ signedUrl: string; publicUrl: string }>;
  onLog: (text: string, kind?: "info" | "ok" | "err") => void;
  companyId?: string | null;
  productId?: string | null;
  engine?: string;
  fieldLabel?: string;
}) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [tab, setTab] = useState<"upload" | "ai" | "library">("upload");
  const inputRef = useRef<HTMLInputElement>(null);

  const saveAsset = useServerFn(saveProductAsset);
  const generateImg = useServerFn(generateProductImage);
  const listAssets = useServerFn(listProductAssets);

  const showLibrary = !!companyId && engine === "illustrator";
  const showAi = engine === "illustrator" || !engine;

  const assetsQ = useQuery({
    queryKey: ["product-assets", companyId, productId],
    queryFn: () =>
      listAssets({ data: { companyId: companyId ?? null, productId: productId ?? null } }),
    enabled: showLibrary && tab === "library",
  });

  const invalidateLibrary = () =>
    qc.invalidateQueries({ queryKey: ["product-assets", companyId, productId] });

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const { signedUrl, publicUrl } = await requestUpload(file.name);
      const res = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      onChange(publicUrl);
      onLog(`Uploaded ${file.name}`, "ok");
      if (companyId) {
        await saveAsset({
          data: {
            companyId,
            productId: productId ?? null,
            url: publicUrl,
            name: file.name,
            source: "upload",
            prompt: null,
          },
        });
        invalidateLibrary();
        onLog(`Saved ${file.name} to product live files`, "ok");
      }
    } catch (e) {
      onLog(e instanceof Error ? e.message : "Upload failed", "err");
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    try {
      const { url } = await generateImg({
        data: {
          prompt: aiPrompt.trim(),
          companyId: companyId ?? null,
          productId: productId ?? null,
        },
      });
      onChange(url);
      onLog(`AI generated image for "${fieldLabel ?? "image"}"`, "ok");
      invalidateLibrary();
    } catch (e) {
      onLog(e instanceof Error ? e.message : "Generation failed", "err");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-2">
      <Input
        placeholder="Image URL (or use options below)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <img
          src={value}
          alt="preview"
          className="h-20 w-20 rounded border object-cover"
        />
      )}
      <div className="flex gap-1 border-b text-xs">
        <button
          type="button"
          className={`px-2 py-1 ${tab === "upload" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
          onClick={() => setTab("upload")}
        >
          Upload
        </button>
        {showAi && (
          <button
            type="button"
            className={`px-2 py-1 ${tab === "ai" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
            onClick={() => setTab("ai")}
          >
            <Sparkles className="mr-1 inline h-3 w-3" />AI generate
          </button>
        )}
        {showLibrary && (
          <button
            type="button"
            className={`px-2 py-1 ${tab === "library" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
            onClick={() => setTab("library")}
          >
            Product files
          </button>
        )}
      </div>

      {tab === "upload" && (
        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1 h-3.5 w-3.5" />
            )}
            Upload image
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          {companyId ? (
            <p className="text-[10px] text-muted-foreground">
              Saved to the product live files library and reusable later.
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              Tip: CSV columns and the brief assistant also accept image URLs.
            </p>
          )}
        </div>
      )}

      {tab === "ai" && showAi && (
        <div className="space-y-1">
          <Textarea
            rows={2}
            placeholder={`Describe the ${fieldLabel ?? "image"} you want (e.g. "Aerial photo of Sydney harbor at golden hour, cinematic")`}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={generating || !aiPrompt.trim()}
            onClick={handleGenerate}
          >
            {generating ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="mr-1 h-3.5 w-3.5" />
            )}
            Generate with AI
          </Button>
          {companyId && (
            <p className="text-[10px] text-muted-foreground">
              Auto-saved to the product live files library.
            </p>
          )}
        </div>
      )}

      {tab === "library" && showLibrary && (
        <div className="space-y-1">
          {assetsQ.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : assetsQ.data?.assets.length ? (
            <div className="grid grid-cols-4 gap-2">
              {assetsQ.data.assets.map((a: { id: string; name: string; url: string; source: string }) => (
                <button
                  key={a.id}
                  type="button"
                  className={`group relative aspect-square overflow-hidden rounded border ${value === a.url ? "ring-2 ring-primary" : "hover:border-primary/50"}`}
                  onClick={() => {
                    onChange(a.url);
                    onLog(`Picked ${a.name} from library`, "ok");
                  }}
                  title={a.name}
                >
                  <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                  {a.source === "ai" && (
                    <span className="absolute right-0.5 top-0.5 rounded bg-primary/90 px-1 text-[9px] text-primary-foreground">
                      AI
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No files yet — upload or generate to populate this product's library.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
