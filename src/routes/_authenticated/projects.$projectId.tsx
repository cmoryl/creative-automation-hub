import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProject } from "@/lib/workspace.functions";
import { listChatMessages, sendChatMessage } from "@/lib/chat.functions";
import { createJob, listProjectJobs, preflightEngine } from "@/lib/agent.functions";
import { createHybridRender } from "@/lib/hybrid.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Bot, User, Send, ArrowLeft, Play, Layers } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  component: ProjectDetail,
});

type Msg = { id: string; role: string; content: string | null };

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

  const queueRender = async (engine: "illustrator" | "indesign" | "figma" | "canva" | "mock") => {
    try {
      const pre = await preflightFn({ data: { projectId, engine } });
      pre.warnings.forEach((w) => toast.warning(w));
      if (!pre.ok) {
        pre.blockers.forEach((b) => toast.error(b));
        return;
      }
      await createJobFn({ data: { projectId, engine, brief: {}, variables: {} } });
      toast.success(`Queued ${engine} render`);
      qc.invalidateQueries({ queryKey: ["jobs", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const queueHybrid = async () => {
    try {
      const engines: ("figma" | "illustrator" | "indesign")[] = ["figma", "illustrator", "indesign"];
      const checks = await Promise.all(
        engines.map((e) => preflightFn({ data: { projectId, engine: e } })),
      );
      checks.forEach((c) => c.warnings.forEach((w) => toast.warning(w)));
      const blockers = checks.flatMap((c) => c.blockers);
      if (blockers.length) {
        blockers.forEach((b) => toast.error(b));
        return;
      }
      const res = await hybridFn({ data: { projectId, engines, brief: {}, variables: {} } });
      toast.success(`Queued ${res.jobs.length} hybrid jobs`);
      qc.invalidateQueries({ queryKey: ["jobs", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject({ data: { id: projectId } }),
  });
  const { data: messages = [] } = useQuery<Msg[]>({
    queryKey: ["chat", projectId],
    queryFn: () => fetchMessages({ data: { projectId } }),
  });
  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs", projectId],
    queryFn: () => fetchJobs({ data: { projectId } }),
    refetchInterval: 4000,
  });

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setStreaming("");
    try {
      const iter = await sendFn({ data: { projectId, message: text } });
      let buf = "";
      for await (const chunk of iter as AsyncIterable<{ delta: string }>) {
        buf += chunk.delta;
        setStreaming(buf);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chat failed");
    } finally {
      setStreaming("");
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["chat", projectId] });
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-8 py-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/projects"><ArrowLeft className="h-4 w-4" /> Back</Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{project?.name ?? "Project"}</h1>
            <p className="text-xs text-muted-foreground">Claude-orchestrated workflow</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(["illustrator", "indesign", "figma", "mock"] as const).map((eng) => (
            <Button
              key={eng}
              size="sm"
              variant="outline"
              size="sm"
              variant="outline"
              onClick={() => queueRender(eng)}
            >
              <Play className="h-3 w-3" /> {eng}
            </Button>
          ))}
          <Button size="sm" onClick={queueHybrid}>
            <Layers className="h-3 w-3" /> hybrid
          </Button>
        </div>
      </header>

      {jobs.length > 0 && (
        <div className="border-b bg-muted/40 px-8 py-2 text-xs">
          <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
            <div className="flex flex-wrap gap-2">
              {jobs.slice(0, 6).map((j) => (
                <span
                  key={j.id}
                  title={j.error ?? undefined}
                  className={`rounded px-2 py-0.5 ${
                    j.status === "completed" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" :
                    j.status === "failed"    ? "bg-red-500/15 text-red-700 dark:text-red-300" :
                    j.status === "running"   ? "bg-blue-500/15 text-blue-700 dark:text-blue-300" :
                                               "bg-muted text-muted-foreground"
                  }`}
                >
                  {j.engine}: {j.status}
                </span>
              ))}
            </div>
            {jobs.filter((j) => j.status === "failed" && /template not found locally/i.test(j.error ?? "")).slice(0, 1).map((j) => (
              <div key={`hint-${j.id}`} className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-800 dark:text-amber-200">
                <strong>Missing template file on the Mac.</strong> Drop the <code>.ai</code> file in <code>~/LovableTemplates/</code> (or set <code>LOVABLE_AGENT_TEMPLATES</code> to its folder) and re-run.
                {j.error && <div className="mt-1 truncate font-mono text-[10px] opacity-70">{j.error}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.length === 0 && !streaming && (
            <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
              Start by describing your campaign. Claude will pick templates, propose variables, and queue renders.
            </div>
          )}
          {messages.map((m) => <Bubble key={m.id} role={m.role} content={m.content ?? ""} />)}
          {streaming && <Bubble role="assistant" content={streaming} />}
          {busy && !streaming && (
            <div className="text-xs text-muted-foreground">Thinking…</div>
          )}
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
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
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
