import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  ListChecks,
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
  parseCsvFile,
  dispatchVariations,
} from "@/lib/brief-agent.functions";

type Variable = {
  name: string;
  label?: string;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
  layer?: string;
};

type ChatMsg = { role: "user" | "assistant"; content: string };
type InputMode = "form" | "stepper" | "csv";
type Section = { id: string; title: string; fieldNames: string[] };

const ENGINES: { id: "illustrator" | "indesign" | "figma" | "canva"; label: string }[] = [
  { id: "illustrator", label: "Illustrator" },
  { id: "indesign", label: "InDesign" },
  { id: "figma", label: "Figma" },
  { id: "canva", label: "Canva" },
];

export function CreateVariationsTab({
  templateId,
  templateName,
  variables,
}: {
  templateId: string;
  templateName: string;
  variables: Variable[];
}) {
  const qc = useQueryClient();
  const chatFn = useServerFn(briefAgentChat);
  const uploadUrlFn = useServerFn(createBriefUploadUrl);
  const parseFn = useServerFn(parseCsvFile);
  const dispatchFn = useServerFn(dispatchVariations);

  const [mode, setMode] = useState<InputMode | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [sections, setSections] = useState<Section[]>([]);
  const [engines, setEngines] = useState<Set<string>>(
    new Set(["illustrator"]),
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

  const logActivity = (text: string, kind: "info" | "ok" | "err" = "info") =>
    setActivityLog((l) => [...l, { ts: Date.now(), text, kind }]);

  // auto-derive sections from layers when entering stepper without AI sections
  const fallbackSections: Section[] = useMemo(() => {
    const byLayer: Record<string, string[]> = {};
    for (const v of variables) {
      const key = v.layer ?? "General";
      (byLayer[key] ??= []).push(v.name);
    }
    return Object.entries(byLayer).map(([title, fieldNames], i) => ({
      id: `s${i}`,
      title,
      fieldNames,
    }));
  }, [variables]);

  const activeSections = sections.length ? sections : fallbackSections;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" });
  }, [messages]);

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
      if (res.suggestedMode && !mode) setMode(res.suggestedMode);
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
      logActivity("Preparing brief…");
      let rows: { label: string; values: Record<string, string> }[] = [];
      if (mode === "csv") {
        if (!csvRows.length) throw new Error("Upload a CSV first");
        rows = csvRows.map((r, i) => {
          const mapped: Record<string, string> = {};
          for (const v of variables) {
            const col = csvMapping[v.name];
            if (col && r[col] != null) mapped[v.name] = String(r[col]);
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
        logActivity(`Mapped ${rows.length} CSV rows to template fields`, "ok");
      } else {
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
          "No live bridge agent — Illustrator/InDesign jobs mocked with preview",
          "info",
        );
      }
      setLastResult(res);
      toast.success(
        `Created ${res.created.length} variation(s) × ${res.engines.length} engine(s)`,
      );
      qc.invalidateQueries({ queryKey: ["template", templateId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Dispatch failed";
      logActivity(msg, "err");
      toast.error(msg);
    },
  });
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Dispatch failed"),
  });

  const renderField = (v: Variable) => {
    const val = values[v.name] ?? "";
    const onChange = (newVal: string) =>
      setValues((s) => ({ ...s, [v.name]: newVal }));
    if (v.type === "color")
      return (
        <Input
          type="color"
          value={val || "#0066cc"}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    if (v.multiline || v.name.match(/challenge|solution|results|quote/i))
      return (
        <Textarea
          rows={3}
          placeholder={v.placeholder ?? v.label ?? v.name}
          value={val}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    return (
      <Input
        placeholder={v.placeholder ?? v.label ?? v.name}
        value={val}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  };

  return (
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
              { id: "form", icon: Sparkles, label: "Form" },
              { id: "stepper", icon: ListChecks, label: "Stepper" },
              { id: "csv", icon: FileSpreadsheet, label: "CSV" },
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
          {!mode && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Chat with the assistant or pick a mode above.
            </div>
          )}

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

          {mode === "stepper" && activeSections.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Step {step + 1} / {activeSections.length}:{" "}
                  <strong className="text-foreground">
                    {activeSections[step]?.title}
                  </strong>
                </span>
                <div className="flex gap-1">
                  {activeSections.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 w-6 rounded ${
                        i <= step ? "bg-primary" : "bg-muted"
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {activeSections[step]?.fieldNames
                  .map((n) => variables.find((v) => v.name === n))
                  .filter((v): v is Variable => !!v)
                  .map((v) => (
                    <div key={v.name} className="space-y-1">
                      <label className="text-xs font-medium">
                        {v.label ?? v.name}
                      </label>
                      {renderField(v)}
                    </div>
                  ))}
              </div>
              <div className="flex justify-between pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={step === 0}
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Back
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={step >= activeSections.length - 1}
                  onClick={() =>
                    setStep((s) => Math.min(activeSections.length - 1, s + 1))
                  }
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
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
            disabled={dispatch.isPending || !mode}
            onClick={() => dispatch.mutate()}
          >
            <Wand2 className="h-4 w-4" />{" "}
            {dispatch.isPending
              ? "Dispatching…"
              : mode === "csv"
                ? `Dispatch ${csvRows.length} × ${engines.size} = ${csvRows.length * engines.size} files`
                : `Create variation × ${engines.size} engine(s)`}
          </Button>
        </div>
      </Card>
    </div>
  );
}
