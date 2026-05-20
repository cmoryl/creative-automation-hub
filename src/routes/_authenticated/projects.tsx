import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listProjects, createProject } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, FolderKanban } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const fetchProjects = useServerFn(listProjects);
  const createFn = useServerFn(createProject);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => fetchProjects(),
  });

  const create = useMutation({
    mutationFn: (n: string) => createFn({ data: { name: n } }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setName("");
      if (p?.id) navigate({ to: "/projects/$projectId", params: { projectId: p.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create"),
  });

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground">Campaigns powered by Claude + your templates.</p>
        </div>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate(name.trim());
        }}
        className="mb-8 flex gap-2"
      >
        <Input
          placeholder="New project name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          <Plus className="h-4 w-4" /> Create
        </Button>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <FolderKanban className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No projects yet. Create your first campaign.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                to="/projects/$projectId"
                params={{ projectId: p.id }}
                className="block rounded-lg border bg-card p-5 transition-colors hover:bg-accent"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{p.name}</h2>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs">{p.status}</span>
                </div>
                {p.brief && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.brief}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
