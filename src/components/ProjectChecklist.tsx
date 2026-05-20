import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle } from "lucide-react";

type JobLike = { status: string; engine: string; variables?: unknown };
type MsgLike = { role: string; content: string | null };

export function ProjectChecklist({
  messages,
  jobs,
}: {
  messages: MsgLike[];
  jobs: JobLike[];
}) {
  const briefWritten = messages.some(
    (m) => m.role === "assistant" && (m.content ?? "").trim().length > 40,
  );
  const renderQueued = jobs.length > 0;
  const variablesFilled = jobs.some((j) => {
    const v = j.variables as Record<string, unknown> | null | undefined;
    return v && Object.keys(v).length > 0;
  });
  const renderCompleted = jobs.some((j) => j.status === "completed");
  const noFailures = jobs.length > 0 && jobs.every((j) => j.status !== "failed");

  const steps = [
    { label: "Chat with AI to draft a brief", done: briefWritten },
    { label: "Queue a render from any engine", done: renderQueued },
    { label: "Variables sent with at least one job", done: variablesFilled },
    { label: "Preflight passed (no failed jobs)", done: noFailures && renderQueued },
    { label: "First render completed", done: renderCompleted },
  ];

  const completed = steps.filter((s) => s.done).length;
  const pct = (completed / steps.length) * 100;

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Project progress
          <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
            {completed}/{steps.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <Progress value={pct} className="h-1" />
        <ul className="space-y-1.5 text-xs">
          {steps.map((s) => (
            <li key={s.label} className="flex items-start gap-2">
              {s.done ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              )}
              <span className={s.done ? "text-foreground/70 line-through" : "text-foreground"}>
                {s.label}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
