import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getShowcase } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Figma, Palette, FileText, Layers, Sparkles, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/examples")({
  component: ExamplesPage,
});

const ENGINE_META: Record<
  string,
  { label: string; icon: typeof Figma; tone: string }
> = {
  figma: { label: "Figma", icon: Figma, tone: "bg-purple-500/15 text-purple-300" },
  illustrator: { label: "Illustrator", icon: Palette, tone: "bg-orange-500/15 text-orange-300" },
  indesign: { label: "InDesign", icon: FileText, tone: "bg-pink-500/15 text-pink-300" },
  canva: { label: "Canva", icon: Layers, tone: "bg-cyan-500/15 text-cyan-300" },
  hybrid: { label: "Hybrid", icon: Sparkles, tone: "bg-primary/15 text-primary" },
  mock: { label: "Sandbox", icon: Sparkles, tone: "bg-muted text-muted-foreground" },
};

function ExamplesPage() {
  const fetchShowcase = useServerFn(getShowcase);
  const { data, isLoading } = useQuery({
    queryKey: ["showcase"],
    queryFn: () => fetchShowcase(),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-10 p-8">
      <header>
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Live examples
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Templates, briefs & renders — already in your workspace
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Every workspace ships seeded with one template per engine, a sample
          campaign brief, and finished renders so you can see the full pipeline
          end-to-end before you connect a single tool.
        </p>
      </header>

      {isLoading || !data ? (
        <p className="text-muted-foreground">Loading examples…</p>
      ) : (
        <>
          <Section title="Sample brief" subtitle="Open the example project to chat with Claude about it.">
            {data.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No example project found.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {data.projects.map((p) => (
                  <Card key={p.id}>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      <Badge variant="outline">{p.status}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                        {p.brief ?? ""}
                      </pre>
                      <Button asChild size="sm">
                        <Link to="/projects/$projectId" params={{ projectId: p.id }}>
                          Open project →
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Templates"
            subtitle="One per engine, registered automatically. Click to inspect variables."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.templates.map((t) => {
                const meta = ENGINE_META[t.engine] ?? ENGINE_META.mock;
                const Icon = meta.icon;
                const vars = Array.isArray(t.variables) ? t.variables : [];
                return (
                  <Card key={t.id} className="overflow-hidden">
                    {t.preview_url && (
                      <img
                        src={t.preview_url}
                        alt={t.name}
                        className="aspect-square w-full object-cover"
                      />
                    )}
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-center justify-between">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${meta.tone}`}
                        >
                          <Icon className="h-3 w-3" /> {meta.label}
                        </span>
                        {t.source_ref && (
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className="text-sm font-medium">{t.name}</div>
                      <div className="flex flex-wrap gap-1">
                        {vars.slice(0, 4).map((v, i) => {
                          const name = typeof v === "object" && v && "name" in v ? String((v as { name: unknown }).name) : `var${i}`;
                          return (
                            <Badge key={name + i} variant="secondary" className="text-[10px]">
                              {name}
                            </Badge>
                          );
                        })}
                        {vars.length > 4 && (
                          <Badge variant="secondary" className="text-[10px]">
                            +{vars.length - 4}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </Section>

          <Section
            title="Live renders"
            subtitle="The seeded jobs already produced these outputs. Everything is real, queryable data."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.outputs.map((o) => {
                const job = data.jobs.find((j) => j.id === o.job_id);
                const meta = ENGINE_META[job?.engine ?? "mock"] ?? ENGINE_META.mock;
                return (
                  <a
                    key={o.id}
                    href={o.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group overflow-hidden rounded-lg border bg-card transition hover:border-primary"
                  >
                    <img src={o.url} alt={o.kind} className="aspect-square w-full object-cover" />
                    <div className="space-y-1 p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium uppercase">{o.kind}</span>
                        <span className={`rounded-full px-2 py-0.5 ${meta.tone}`}>
                          {meta.label}
                        </span>
                      </div>
                      <div className="text-muted-foreground">
                        {(o.metadata as Record<string, unknown>)?.channel as string ?? "—"}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
