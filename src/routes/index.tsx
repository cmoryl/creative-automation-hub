import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sparkles, Workflow, FileStack, Bot } from "lucide-react";

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
    ],
  }),
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-5 w-5 text-primary" />
            Creative Automation
          </div>
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

      <main>
        <section className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h1 className="text-5xl font-bold tracking-tight md:text-6xl">
            Brief in. On-brand variants out.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            A Claude-orchestrated creative automation platform. Drive Canva, Figma,
            Illustrator and InDesign templates from a single workflow — generate live,
            editable files and press-ready exports without an Electron shell.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/login">Start free</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how">How it works</a>
            </Button>
          </div>
        </section>

        <section id="how" className="border-t bg-muted/30">
          <div className="mx-auto grid max-w-6xl gap-6 px-6 py-20 md:grid-cols-3">
            {[
              {
                icon: Bot,
                title: "Claude orchestration",
                body: "Describe the campaign. Claude picks templates, fills variables, and queues renders.",
              },
              {
                icon: Workflow,
                title: "Live + headless engines",
                body: "Canva & Figma over the web. Illustrator & InDesign via a local bridge agent — no desktop window.",
              },
              {
                icon: FileStack,
                title: "Output Center",
                body: "Versioned creatives, channel bundles, exports — organized by campaign and ready to ship.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-lg border bg-card p-6">
                <Icon className="h-6 w-6 text-primary" />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">
          © {new Date().getFullYear()} Creative Automation Platform
        </div>
      </footer>
    </div>
  );
}
