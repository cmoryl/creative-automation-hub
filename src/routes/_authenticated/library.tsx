import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  listTemplates,
  listProjects,
  listJobs,
  listOutputs,
} from "@/lib/workspace.functions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderTree, Filter } from "lucide-react";

export const Route = createFileRoute("/_authenticated/library")({
  component: LibraryPage,
});

const ENGINES = ["all", "figma", "illustrator", "indesign", "canva", "hybrid", "mock"] as const;

function LibraryPage() {
  const fetchTemplates = useServerFn(listTemplates);
  const fetchProjects = useServerFn(listProjects);
  const fetchJobs = useServerFn(listJobs);
  const fetchOutputs = useServerFn(listOutputs);

  const templates = useQuery({ queryKey: ["lib-templates"], queryFn: () => fetchTemplates() });
  const projects = useQuery({ queryKey: ["lib-projects"], queryFn: () => fetchProjects() });
  const jobs = useQuery({ queryKey: ["lib-jobs"], queryFn: () => fetchJobs() });
  const outputs = useQuery({ queryKey: ["lib-outputs"], queryFn: () => fetchOutputs() });

  const [q, setQ] = useState("");
  const [engine, setEngine] = useState<(typeof ENGINES)[number]>("all");

  const filterEngine = <T extends { engine?: string | null }>(arr: T[] | undefined) =>
    (arr ?? []).filter((x) => (engine === "all" ? true : x.engine === engine));

  const filterQ = <T extends Record<string, unknown>>(arr: T[], fields: (keyof T)[]) =>
    arr.filter((x) =>
      q
        ? fields.some((f) => String(x[f] ?? "").toLowerCase().includes(q.toLowerCase()))
        : true,
    );

  const tplList = useMemo(
    () => filterQ(filterEngine(templates.data), ["name", "engine", "source_ref"]),
    [templates.data, engine, q],
  );
  const jobList = useMemo(
    () => filterQ(filterEngine(jobs.data), ["engine", "status", "id"]),
    [jobs.data, engine, q],
  );
  const projList = useMemo(
    () => filterQ(projects.data ?? [], ["name", "status"]),
    [projects.data, q],
  );
  const outList = useMemo(
    () => filterQ(outputs.data ?? [], ["kind", "url"]),
    [outputs.data, q],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-8">
      <header>
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary">
          <FolderTree className="h-3.5 w-3.5" /> Library
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Everything in your workspace, in one place
        </h1>
        <p className="mt-2 text-muted-foreground">
          Browse and search templates, projects, jobs and outputs. Filter by engine to scope the view.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Input
            placeholder="Search by name, engine, status, url…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border bg-card p-1">
          <Filter className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
          {ENGINES.map((e) => (
            <button
              key={e}
              onClick={() => setEngine(e)}
              className={`rounded px-2 py-1 text-xs capitalize transition ${
                engine === e
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Templates ({tplList.length})</TabsTrigger>
          <TabsTrigger value="projects">Projects ({projList.length})</TabsTrigger>
          <TabsTrigger value="jobs">Jobs ({jobList.length})</TabsTrigger>
          <TabsTrigger value="outputs">Outputs ({outList.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tplList.map((t) => (
              <Card key={t.id} className="overflow-hidden">
                {t.preview_url && (
                  <img src={t.preview_url} alt={t.name} className="aspect-video w-full object-cover" />
                )}
                <CardContent className="space-y-1 p-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="capitalize">{t.engine}</Badge>
                    <code className="text-[10px] text-muted-foreground">{t.id.slice(0, 8)}</code>
                  </div>
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{t.source_ref}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="projects" className="mt-4">
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {projList.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3"><Badge variant="outline">{p.status}</Badge></td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(p.updated_at).toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: p.id }}
                        className="text-primary hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Engine</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Created</th>
                  <th className="p-3">Job ID</th>
                </tr>
              </thead>
              <tbody>
                {jobList.map((j) => (
                  <tr key={j.id} className="border-t">
                    <td className="p-3"><Badge variant="outline" className="capitalize">{j.engine}</Badge></td>
                    <td className="p-3 capitalize">{j.status}</td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(j.created_at).toLocaleString()}
                    </td>
                    <td className="p-3"><code className="text-xs">{j.id.slice(0, 8)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="outputs" className="mt-4">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {outList.map((o) => (
              <a
                key={o.id}
                href={o.url}
                target="_blank"
                rel="noreferrer"
                className="overflow-hidden rounded-lg border bg-card transition hover:border-primary"
              >
                <img src={o.url} alt={o.kind} className="aspect-square w-full object-cover" />
                <div className="p-2 text-xs">
                  <div className="font-medium uppercase">{o.kind}</div>
                  <div className="truncate text-muted-foreground">{o.url}</div>
                </div>
              </a>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
