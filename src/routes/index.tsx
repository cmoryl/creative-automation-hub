import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Workflow,
  FileStack,
  Bot,
  Figma,
  Palette,
  FileText,
  Layers,
  Zap,
  Upload,
  MousePointerClick,
  Download,
  KeyRound,
  Plug,
  Terminal,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Creative Automation Platform — Claude-orchestrated brand creative at scale" },
      {
        name: "description",
        content:
          "Brief in, on-brand variants out. Orchestrate Canva, Figma, Illustrator and InDesign templates with Claude and a local bridge agent — no Electron required.",
      },
      { property: "og:title", content: "Creative Automation Platform" },
      {
        property: "og:description",
        content:
          "One brief → live, editable files across Figma, Illustrator, InDesign and Canva. Run single renders or batch a CSV across every engine at once.",
      },
    ],
  }),
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <EnginesStrip />
        <HowItWorks />
        <FeatureGrid />
        <WhoFor />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-5 w-5 text-primary" />
          Creative Automation
        </div>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#engines" className="hover:text-foreground">Engines</a>
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#who" className="hover:text-foreground">Who it's for</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/login">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--primary) 20%, transparent), transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-4xl px-6 py-24 text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" />
          Claude-orchestrated · Figma · Illustrator · InDesign · Canva
        </div>
        <h1 className="text-5xl font-bold tracking-tight md:text-6xl">
          One brief. Every channel.
          <span className="block text-primary">On-brand, automatically.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Describe the campaign in plain language. We pick the right templates,
          fill the variables, and produce live, editable files across Figma,
          Illustrator, InDesign and Canva — plus press-ready exports.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/login">Start free</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#how">See how it works</a>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          No Electron app. No vendor lock-in. Your tokens, your tools.
        </p>
      </div>
    </section>
  );
}

const ENGINES = [
  { icon: Figma, name: "Figma", desc: "Frames → PNG, SVG, PDF & variables", mode: "Cloud API" },
  { icon: Palette, name: "Illustrator", desc: "AI automation on .ai files", mode: "Local bridge" },
  { icon: FileText, name: "InDesign", desc: "Document-scale .indd exports", mode: "Local bridge" },
  { icon: Layers, name: "Canva", desc: "API-driven template autofills", mode: "Cloud API" },
  { icon: Sparkles, name: "Hybrid", desc: "Fan one brief across every engine", mode: "Orchestrated" },
];

function EnginesStrip() {
  return (
    <section id="engines" className="border-y bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <SectionHeading
          eyebrow="Engines"
          title="Five engines, one workflow"
          subtitle="Mix cloud APIs with a tiny local bridge agent for the desktop apps. Same brief, same brand, every format."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ENGINES.map(({ icon: Icon, name, desc, mode }) => (
            <div key={name} className="rounded-lg border bg-card p-5">
              <div className="flex items-center justify-between">
                <Icon className="h-6 w-6 text-primary" />
                <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {mode}
                </span>
              </div>
              <h3 className="mt-4 font-semibold">{name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    icon: Upload,
    title: "1. Connect & upload",
    body: "Connect Figma, Canva, or run the local bridge for Illustrator/InDesign. Register templates in seconds.",
  },
  {
    icon: MousePointerClick,
    title: "2. Brief in plain English",
    body: "Chat with Claude inside your project. It picks templates, fills variables, and queues renders.",
  },
  {
    icon: Download,
    title: "3. Ship versioned outputs",
    body: "Live editable files, channel bundles and press-ready exports — versioned per campaign in the Output Center.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="border-b">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="How it works"
          title="From brief to bundle in three steps"
          subtitle="No new design tool to learn — your existing templates do the work."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="relative rounded-lg border bg-card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: Bot,
    title: "Claude orchestration",
    body: "Per-project chat that reads your templates, brand kit and brief — and triggers renders for you.",
  },
  {
    icon: Workflow,
    title: "Hybrid renders",
    body: "Queue one brief across Figma + Illustrator + InDesign + Canva in a single click, grouped as a hybrid job.",
  },
  {
    icon: FileStack,
    title: "Output Center",
    body: "Every render versioned, tagged by engine, downloadable as channel bundles.",
  },
  {
    icon: Plug,
    title: "Manual integrations",
    body: "Paste a Figma PAT, Canva Client ID/Secret — or run the bridge agent for desktop apps. Your tokens stay yours.",
  },
  {
    icon: KeyRound,
    title: "Public REST API",
    body: "Workspace-scoped cap_ tokens. Create jobs from CI, Claude Code, or a Claude skill.",
  },
  {
    icon: Terminal,
    title: "Local bridge agent",
    body: "A tiny Node CLI for macOS/Windows that drives Illustrator & InDesign — no Electron, no kernel extensions.",
  },
];

function FeatureGrid() {
  return (
    <section id="features" className="border-b bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Features"
          title="Built for creative ops teams"
          subtitle="The pieces you need to industrialise creative without flattening it."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border bg-card p-6">
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const AUDIENCES = [
  {
    title: "Brand & creative ops",
    bullets: [
      "Localise one master across 20 markets",
      "Enforce brand kits on every render",
      "Audit who shipped what, when",
    ],
  },
  {
    title: "In-house studios",
    bullets: [
      "Free designers from variant work",
      "Batch a CSV through every engine",
      "Keep editable source files, not just PNGs",
    ],
  },
  {
    title: "Agencies",
    bullets: [
      "Per-client workspaces & API tokens",
      "Claude skill drops into Claude Code",
      "Bridge agent runs on the same Mac your designers use",
    ],
  },
];

function WhoFor() {
  return (
    <section id="who" className="border-b">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Who it's for"
          title="Made for the teams scaling brand creative"
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {AUDIENCES.map(({ title, bullets }) => (
            <div key={title} className="rounded-lg border bg-card p-6">
              <h3 className="font-semibold">{title}</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-4xl px-6 py-24 text-center">
        <Zap className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
          Stop hand-resizing creative.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Spin up your first project in under a minute. Bring one template,
          one brief, and watch every variant render itself.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/login">Start free</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/login">Book a demo</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer>
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground md:flex-row">
        <div>© {new Date().getFullYear()} Creative Automation Platform</div>
        <div className="flex items-center gap-4">
          <a href="#engines" className="hover:text-foreground">Engines</a>
          <a href="#how" className="hover:text-foreground">How</a>
          <a href="#features" className="hover:text-foreground">Features</a>
          <Link to="/login" className="hover:text-foreground">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="text-xs font-medium uppercase tracking-widest text-primary">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
