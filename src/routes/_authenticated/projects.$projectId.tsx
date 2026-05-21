import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProject, deleteOutput } from "@/lib/workspace.functions";
import { listChatMessages, sendChatMessage } from "@/lib/chat.functions";
import {
  createJob,
  listProjectJobs,
  preflightEngine,
  retryJob,
  cancelJob,
} from "@/lib/agent.functions";
import { createHybridRender } from "@/lib/hybrid.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ProjectChecklist } from "@/components/ProjectChecklist";
import { PreflightPanel } from "@/components/PreflightPanel";
import { CanvaJobRunner } from "@/components/canva/CanvaJobRunner";
import { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Bot, User, Send, ArrowLeft, Play, Layers,
  RotateCcw, X as XIcon, Trash2, AlertCircle, Settings2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  component: ProjectDetail,
});

type Msg = { id: string; role: string; content: string | null };
type Output = { id: string; kind: string; url: string };
type JobRow = {
  id: string;
  engine: string;
  status: string;
  error: string | null;
  brief: unknown;
  variables: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
  outputs: Output[] | null;
};

function getProgress(brief: unknown): { stage: string; percent: number; message: string | null } | null {
  if (!brief || typeof brief !== "object") return null;
  const p = (brief as Record<string, unknown>).progress;
  if (!p || typeof p !== "object") return null;
  const r = p as Record<string, unknown>;
  if (typeof r.percent !== "number") return null;
  return { stage: String(r.stage ?? ""), percent: r.percent, message: r.message ? String(r.message) : null };
}

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const fetchProject = useServerFn(getProject);
  const fetchMessages = useServerFn(listChatMessages);
  const sendFn = useServerFn(sendChatMessage);
  const qc = useQueryClient();
  const createJobFn = useServerFn(createJob);
  const fetchJobs = useServerFn(listProjectJobs);
  const hybridFn = useServerFn(createHybridRender);
  const preflightFn = useServerFn(preflightEngine);
  const retryFn = useServerFn(retryJob);
  const cancelFn = useServerFn(cancelJob);
  const deleteOutputFn = useServerFn(deleteOutput);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject({ data: { id: projectId } }),
  });
  const { data: messages = [] } = useQuery<Msg[]>({
    queryKey: ["chat", projectId],
    queryFn: () => fetchMessages({ data: { projectId } }),
  });
  const { data: jobs = [] } = useQuery<JobRow[]>({
    queryKey: ["jobs", projectId],
    queryFn: () => fetchJobs({ data: { projectId } }) as Promise<JobRow[]>,
    refetchInterval: 15000, // safety net; realtime drives the main updates
  });

  // Realtime subscription on jobs + outputs in this project.
  // Tracks last-seen status per job so we can toast on completion/failure.
  const seenStatus = useRef<Record<string, string>>({});
  useEffect(() => {
    jobs.forEach((j) => {
      const prev = seenStatus.current[j.id];
      if (prev && prev !== j.status) {
        if (j.status === "completed") toast.success(`${j.engine} render completed`);
        if (j.status === "failed") toast.error(`${j.engine} render failed`);
      }
      seenStatus.current[j.id] = j.status;
    });
  }, [jobs]);

  useEffect(() => {
    const ch = supabase
      .channel(`project:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["jobs", projectId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "outputs" },
        () => qc.invalidateQueries({ queryKey: ["jobs", projectId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, qc]);

  // Brief auto-extracted from the latest assistant message.
  const briefFromChat = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant" && (m.content ?? "").trim());
    return last?.content?.trim() ?? "";
  }, [messages]);

  const buildBrief = () => (briefFromChat ? { source: "chat", text: briefFromChat } : {});

  // Seed editable variables from the most recent job that had any.
  const seedVars = useMemo<Record<string, string>>(() => {
    const src = jobs.find((j) => j.variables && Object.keys(j.variables).length > 0);
    if (!src?.variables) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(src.variables)) {
      out[k] = v == null ? "" : String(v);
    }
    return out;
  }, [jobs]);
  const [editVars, setEditVars] = useState<Record<string, string>>({});
  const [varsDirty, setVarsDirty] = useState(false);
  useEffect(() => {
    if (!varsDirty) setEditVars(seedVars);
  }, [seedVars, varsDirty]);
  const [showVars, setShowVars] = useState(true);

  const queueRender = async (engine: "illustrator" | "indesign" | "figma" | "canva" | "claude" | "mock") => {
    try {
      const pre = await preflightFn({ data: { projectId, engine } });
      pre.warnings.forEach((w) => toast.warning(w));
      if (!pre.ok) { pre.blockers.forEach((b) => toast.error(b)); return; }
      await createJobFn({ data: { projectId, engine, brief: buildBrief(), variables: editVars } });
      toast.success(`Queued ${engine} render${briefFromChat ? " with brief from chat" : ""}`);
      qc.invalidateQueries({ queryKey: ["jobs", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const queueHybrid = async () => {
    try {
      const engines: ("figma" | "illustrator" | "indesign")[] = ["figma", "illustrator", "indesign"];
      const checks = await Promise.all(engines.map((e) => preflightFn({ data: { projectId, engine: e } })));
      checks.forEach((c) => c.warnings.forEach((w) => toast.warning(w)));
      const blockers = checks.flatMap((c) => c.blockers);
      if (blockers.length) { blockers.forEach((b) => toast.error(b)); return; }
      const res = await hybridFn({ data: { projectId, engines, brief: buildBrief(), variables: editVars } });
      toast.success(`Queued ${res.jobs.length} hybrid jobs`);
      qc.invalidateQueries({ queryKey: ["jobs", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleRetry = async (jobId: string) => {
    try { await retryFn({ data: { jobId } }); toast.success("Re-queued"); qc.invalidateQueries({ queryKey: ["jobs", projectId] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Retry failed"); }
  };
  const handleCancel = async (jobId: string) => {
    try { await cancelFn({ data: { jobId } }); toast.success("Cancelled"); qc.invalidateQueries({ queryKey: ["jobs", projectId] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Cancel failed"); }
  };
  const handleDeleteOutput = async (id: string) => {
    try { await deleteOutputFn({ data: { id } }); qc.invalidateQueries({ queryKey: ["jobs", projectId] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  };

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, streaming]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput(""); setBusy(true); setStreaming("");
    try {
      const iter = await sendFn({ data: { projectId, message: text } });
      let buf = "";
      for await (const chunk of iter as AsyncIterable<{ delta: string }>) { buf += chunk.delta; setStreaming(buf); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Chat failed"); }
    finally { setStreaming(""); setBusy(false); qc.invalidateQueries({ queryKey: ["chat", projectId] }); }
  };

  const runningJobs = jobs.filter((j) => j.status === "running" || j.status === "queued");
  const failedJobs = jobs.filter((j) => j.status === "failed");
  const allOutputs = jobs.flatMap((j) => (j.outputs ?? []).map((o) => ({ ...o, engine: j.engine, jobId: j.id })));

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-8 py-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/projects"><ArrowLeft className="h-4 w-4" /> Back</Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{project?.name ?? "Project"}</h1>
            <p className="text-xs text-muted-foreground">
              {briefFromChat ? "Brief from chat will be sent with next render" : "Claude-orchestrated workflow"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(["illustrator", "indesign", "figma", "mock"] as const).map((eng) => (
            <Button key={eng} size="sm" variant="outline" onClick={() => queueRender(eng)}>
              <Play className="h-3 w-3" /> {eng}
            </Button>
          ))}
          <CanvaJobRunner projectId={projectId} />
          <Button size="sm" onClick={queueHybrid}>
            <Layers className="h-3 w-3" /> hybrid
          </Button>
        </div>
      </header>

      {/* Live job tracker — progress for in-flight, full error for failed */}
      {(runningJobs.length > 0 || failedJobs.length > 0) && (
        <div className="border-b bg-muted/40 px-8 py-3 text-xs">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {runningJobs.map((j) => {
              const p = getProgress(j.brief);
              const pct = p?.percent ?? (j.status === "running" ? 10 : 2);
              return (
                <div key={j.id} className="rounded border bg-card p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium">{j.engine}: {j.status}{p?.stage ? ` · ${p.stage}` : ""}</span>
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => handleCancel(j.id)}>
                      <XIcon className="h-3 w-3" /> cancel
                    </Button>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                  {p?.message && <div className="mt-1 truncate text-[10px] text-muted-foreground">{p.message}</div>}
                </div>
              );
            })}
            {failedJobs.slice(0, 3).map((j) => {
              const isMissingTpl = /template not found locally/i.test(j.error ?? "");
              return (
                <div key={j.id} className="rounded border border-red-500/30 bg-red-500/10 p-2 text-red-800 dark:text-red-200">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1 font-medium"><AlertCircle className="h-3 w-3" /> {j.engine} failed</span>
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => handleRetry(j.id)}>
                      <RotateCcw className="h-3 w-3" /> retry
                    </Button>
                  </div>
                  {isMissingTpl && (
                    <div className="mb-1 text-[11px]">
                      Drop the <code>.ai</code> file in <code>~/LovableTemplates/</code> on the agent machine, then retry.
                    </div>
                  )}
                  {j.error && (
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-background/40 p-1.5 font-mono text-[10px] opacity-80">
                      {j.error}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <ProjectChecklist messages={messages} jobs={jobs} />
          <PreflightPanel
            projectId={projectId}
            engine="illustrator"
            variables={editVars}
            compact
          />

          {Object.keys(editVars).length > 0 && (
            <section className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Settings2 className="h-4 w-4" /> Field values
                  <span className="text-xs font-normal text-muted-foreground">
                    sent with the next render
                  </span>
                </h2>
                <div className="flex items-center gap-2">
                  {varsDirty && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setVarsDirty(false); setEditVars(seedVars); }}
                    >
                      Reset
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setShowVars((s) => !s)}>
                    {showVars ? "Hide" : "Show"}
                  </Button>
                </div>
              </div>
              {showVars && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {Object.keys(editVars).sort().map((k) => {
                    const val = editVars[k] ?? "";
                    const isLong = val.length > 60 || /challenge|solution|results|quote|description|body/i.test(k);
                    const isColor = typeof val === "string" && /^#[0-9a-fA-F]{6}$/.test(val);
                    return (
                      <div key={k} className="space-y-1">
                        <Label className="text-xs">{k}</Label>
                        {isColor ? (
                          <Input
                            type="color"
                            value={val}
                            onChange={(e) => { setVarsDirty(true); setEditVars((s) => ({ ...s, [k]: e.target.value })); }}
                          />
                        ) : isLong ? (
                          <Textarea
                            rows={3}
                            value={val}
                            onChange={(e) => { setVarsDirty(true); setEditVars((s) => ({ ...s, [k]: e.target.value })); }}
                          />
                        ) : (
                          <Input
                            value={val}
                            onChange={(e) => { setVarsDirty(true); setEditVars((s) => ({ ...s, [k]: e.target.value })); }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {allOutputs.length > 0 && (
            <section className="rounded-lg border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Renders ({allOutputs.length})</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {allOutputs.map((o) => (
                  <div key={o.id} className="group relative overflow-hidden rounded border bg-muted">
                    <a href={o.url} target="_blank" rel="noreferrer" className="block">
                      {o.kind === "png" || o.kind === "jpg" || o.kind === "jpeg" ? (
                        <img src={o.url} alt={`${o.engine} ${o.kind}`} className="aspect-square w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center text-xs text-muted-foreground">
                          {o.kind.toUpperCase()}
                        </div>
                      )}
                      <div className="flex items-center justify-between px-2 py-1 text-[10px] text-muted-foreground">
                        <span>{o.engine}</span>
                        <span className="uppercase">{o.kind}</span>
                      </div>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDeleteOutput(o.id)}
                      className="absolute right-1 top-1 rounded bg-background/80 p-1 opacity-0 transition hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                      aria-label="Delete output"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
          {messages.length === 0 && !streaming && (
            <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
              Start by describing your campaign. The brief from this chat will flow into each render you queue.
            </div>
          )}
          {messages.map((m) => <Bubble key={m.id} role={m.role} content={m.content ?? ""} />)}
          {streaming && <Bubble role="assistant" content={streaming} />}
          {busy && !streaming && <div className="text-xs text-muted-foreground">Thinking…</div>}
        </div>
      </div>

      <div className="border-t bg-background px-8 py-4">
        <div className="mx-auto flex max-w-3xl gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe the brief… (Cmd+Enter to send)"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
            }}
          />
          <Button onClick={send} disabled={busy || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, content }: { role: string; content: string }) {
  const isUser = role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${isUser ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
        {content}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
