import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/share/$slug")({
  component: SharePage,
});

type SharedOutput = {
  id: string;
  url: string;
  kind: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  jobs?: { engine?: string; row_label?: string | null; templates?: { name?: string } | null } | null;
};

type SharedBatch = {
  jobs: Array<{ id: string; engine: string; status: string; row_label: string | null }>;
  outputs: Array<{ id: string; job_id: string; url: string; kind: string }>;
};

function SharePage() {
  const { slug } = Route.useParams();
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: any }>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/share/${slug}`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) setState({ loading: false, error: body?.error ?? `Error ${res.status}` });
        else setState({ loading: false, data: body });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e instanceof Error ? e.message : "failed" });
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (state.loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (state.error) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <h1 className="text-xl font-bold">Link unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">This share link is {state.error}.</p>
      </div>
    );
  }

  if (state.data?.kind === "output") {
    const o = state.data.output as SharedOutput;
    return (
      <div className="mx-auto max-w-3xl p-8">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Shared {o.jobs?.engine ?? ""} output
          </p>
          <h1 className="mt-1 text-2xl font-bold">{o.jobs?.templates?.name ?? "Untitled"}</h1>
          {o.jobs?.row_label && <p className="text-sm text-muted-foreground">{o.jobs.row_label}</p>}
        </header>
        {o.url && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(o.url) ? (
          <img src={o.url} alt="" className="w-full rounded-lg border" />
        ) : (
          <a href={o.url} className="inline-flex rounded border px-4 py-2 text-sm hover:bg-muted">
            Open file →
          </a>
        )}
      </div>
    );
  }

  if (state.data?.kind === "batch") {
    const b = state.data as SharedBatch;
    const byJob = new Map<string, typeof b.outputs>();
    for (const o of b.outputs) {
      const list = byJob.get(o.job_id) ?? [];
      list.push(o);
      byJob.set(o.job_id, list);
    }
    return (
      <div className="mx-auto max-w-5xl p-8">
        <h1 className="mb-6 text-2xl font-bold">Shared batch ({b.jobs.length} jobs)</h1>
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {b.jobs.map((j) => {
            const outs = byJob.get(j.id) ?? [];
            const img = outs.find((o) => /\.(png|jpe?g|webp)(\?|$)/i.test(o.url));
            return (
              <li key={j.id} className="rounded-lg border bg-card p-3">
                {img ? <img src={img.url} alt="" className="mb-2 aspect-square w-full rounded object-cover" /> : null}
                <p className="text-xs text-muted-foreground">{j.engine}</p>
                <p className="truncate text-sm font-medium">{j.row_label ?? j.id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">{j.status}</p>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return null;
}
