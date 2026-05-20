import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, X, ChevronRight } from "lucide-react";

type Step = {
  id: string;
  title: string;
  body: string;
  done: boolean;
  to: string;
  cta: string;
};

const STORAGE_KEY = "lovable:first-render-wizard:dismissed:v1";

export function FirstRenderWizard({
  hasIntegration,
  hasAgent,
  hasTemplate,
  hasProject,
  hasCompletedJob,
}: {
  hasIntegration: boolean;
  hasAgent: boolean;
  hasTemplate: boolean;
  hasProject: boolean;
  hasCompletedJob: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const steps: Step[] = [
    {
      id: "integration",
      title: "Connect a design tool",
      body: "Link Figma or Canva — or pair your local Adobe agent — so renders have somewhere to run.",
      done: hasIntegration || hasAgent,
      to: hasAgent ? "/settings/integrations" : "/settings/agent",
      cta: "Open Integrations",
    },
    {
      id: "template",
      title: "Add a template",
      body: "Import a Figma file or let your Adobe bridge auto-register a .ai / .indd file.",
      done: hasTemplate,
      to: "/templates",
      cta: "Open Templates",
    },
    {
      id: "project",
      title: "Create your first project",
      body: "Projects hold your brief, jobs, and outputs. Spin one up to start chatting with the AI.",
      done: hasProject,
      to: "/projects",
      cta: "Open Projects",
    },
    {
      id: "render",
      title: "Render your first variation",
      body: "Inside a project, chat to refine the brief, then click an engine button to dispatch a render.",
      done: hasCompletedJob,
      to: "/projects",
      cta: "Go render",
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const allDone = completed === steps.length;

  // If everything is already done, only show a tiny success card (dismissable).
  if (dismissed) return null;

  return (
    <Card className="border-primary/30 bg-primary/[0.02]">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base">
            {allDone ? "You're all set" : "Get started in 4 steps"}
          </CardTitle>
          <CardDescription className="text-xs">
            {allDone
              ? "Setup complete — dismiss this card or revisit any step below."
              : `${completed} of ${steps.length} complete · finish setup to start rendering.`}
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
            setDismissed(true);
          }}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={(completed / steps.length) * 100} className="h-1.5" />
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li
              key={s.id}
              className={`flex items-center gap-3 rounded-md border p-3 transition ${
                s.done ? "border-emerald-500/30 bg-emerald-500/5" : "hover:bg-muted/40"
              }`}
            >
              {s.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-muted-foreground">{i + 1}.</span>
                  <span className={s.done ? "line-through opacity-70" : ""}>{s.title}</span>
                </div>
                <p className="text-xs text-muted-foreground">{s.body}</p>
              </div>
              {!s.done && (
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link to={s.to}>
                    {s.cta} <ChevronRight className="h-3 w-3" />
                  </Link>
                </Button>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
