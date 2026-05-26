import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  FolderKanban,
  LayoutTemplate,
  Plug,
  PlayCircle,
  ListChecks,
  ArrowRight,
} from "lucide-react";

const STORAGE_KEY = "lovable:onboarding-tour:v1";

type Step = {
  icon: typeof Sparkles;
  title: string;
  body: string;
  cta?: { to: string; label: string };
};

const steps: Step[] = [
  {
    icon: Sparkles,
    title: "Welcome to Creative Auto",
    body: "Generate on-brand creative across Illustrator, InDesign, Figma and Canva from one brief. Here's a 60-second tour.",
  },
  {
    icon: LayoutTemplate,
    title: "1. Templates",
    body: "Every render starts from a template. Browse the registry, import from Figma, or pair a local Adobe agent to register .ai / .indd files.",
    cta: { to: "/templates", label: "Open Templates" },
  },
  {
    icon: Plug,
    title: "2. Integrations & Agent",
    body: "Connect Figma/Canva under Integrations. For Adobe, install the desktop bridge in Local Agent — that's how Illustrator and InDesign jobs render on your machine.",
    cta: { to: "/settings/integrations", label: "Open Integrations" },
  },
  {
    icon: FolderKanban,
    title: "3. Projects",
    body: "Create a project, chat with the AI to refine the brief, then dispatch renders. Each project keeps its brief, jobs and outputs together.",
    cta: { to: "/projects", label: "Open Projects" },
  },
  {
    icon: PlayCircle,
    title: "4. Render & track",
    body: "Use 'All Renders' to monitor every job in the workspace in real time — retry failed ones, cancel stuck ones, download outputs.",
    cta: { to: "/jobs", label: "Open All Renders" },
  },
  {
    icon: ListChecks,
    title: "You're ready",
    body: "Head back to the Dashboard whenever you want — the setup checklist there tracks anything still pending.",
    cta: { to: "/dashboard", label: "Go to Dashboard" },
  },
];

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
  }, []);

  const close = () => {
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, new Date().toISOString()); } catch { /* ignore */ }
  };

  const step = steps[i];
  const Icon = step.icon;
  const isLast = i === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <DialogTitle>{step.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">{step.body}</DialogDescription>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 py-2">
          {steps.map((_, idx) => (
            <button
              key={idx}
              aria-label={`Go to step ${idx + 1}`}
              onClick={() => setI(idx)}
              className={`h-1.5 rounded-full transition-all ${
                idx === i ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
              }`}
            />
          ))}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={close}>
            Skip tour
          </Button>
          <div className="flex items-center gap-2">
            {step.cta && (
              <Button variant="outline" size="sm" asChild onClick={close}>
                <Link to={step.cta.to}>{step.cta.label}</Link>
              </Button>
            )}
            {!isLast ? (
              <Button size="sm" onClick={() => setI((n) => Math.min(n + 1, steps.length - 1))}>
                Next <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" onClick={close}>Finish</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function resetOnboardingTour() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  window.location.reload();
}
