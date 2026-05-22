import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Image as ImageIcon, FileImage, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { runExpressJob, listExpressCapabilities } from "@/lib/express.functions";
import { listIntegrations } from "@/lib/integrations.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/templates/express")({
  component: ExpressRunner,
});

function ExpressRunner() {
  const integ = useServerFn(listIntegrations);
  const caps = useServerFn(listExpressCapabilities);
  const run = useServerFn(runExpressJob);

  const { data: integs = [] } = useQuery<any[]>({ queryKey: ["integrations"], queryFn: () => integ() as any });
  const { data: capData } = useQuery({ queryKey: ["express-caps"], queryFn: () => caps() as any });
  const connected = integs.find((i) => i.provider === "express");

  const [projectId, setProjectId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [contentClass, setContentClass] = useState<"photo" | "art" | "graphic">("photo");
  const [n, setN] = useState(2);
  const [outputs, setOutputs] = useState<{ id: string; url: string }[]>([]);

  // Live job tracking
  const [activeJob, setActiveJob] = useState<{
    id: string;
    status: string;
    progress: { stage: string; percent: number; message: string } | null;
    startedAt: number;
  } | null>(null);

  const { data: projects = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["projects-for-express"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id, name").order("created_at", { ascending: false }).limit(50);
      return (data ?? []) as any;
    },
  });

  // Realtime: stream Express job updates for the selected project + outputs.
  useEffect(() => {
    if (!projectId) return;
    const ch = supabase
      .channel(`express-jobs-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs", filter: `project_id=eq.${projectId}` },
        (payload: any) => {
          const row = (payload.new ?? payload.old) as any;
          if (!row || row.engine !== "express") return;
          setActiveJob((cur) => {
            const createdAt = new Date(row.created_at).getTime();
            if (!cur || createdAt >= cur.startedAt - 1000) {
              const progress = row.brief?.progress
                ? {
                    stage: String(row.brief.progress.stage ?? "running"),
                    percent: Number(row.brief.progress.percent ?? 0),
                    message: String(row.brief.progress.message ?? ""),
                  }
                : cur?.progress ?? null;
              return {
                id: row.id,
                status: row.status,
                progress,
                startedAt: cur?.startedAt ?? createdAt,
              };
            }
            return cur;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "outputs" },
        (payload: any) => {
          const row = payload.new as any;
          setActiveJob((cur) => {
            if (cur && row.job_id === cur.id) {
              setOutputs((prev) =>
                prev.find((o) => o.id === row.id) ? prev : [...prev, { id: row.id, url: row.url }],
              );
            }
            return cur;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [projectId]);

  const runMut = useMutation({
    mutationFn: async () => {
      setOutputs([]);
      setActiveJob({
        id: "",
        status: "running",
        progress: { stage: "starting", percent: 1, message: "Submitting to Adobe…" },
        startedAt: Date.now(),
      });
      return (run as any)({
        data: { projectId, mode: "firefly", prompt, variables: {}, size: { width, height }, contentClass, numVariations: n },
      });
    },
    onSuccess: (r: any) => {
      setOutputs((prev) => {
        const merged = [...prev];
        for (const o of r?.outputs ?? []) if (!merged.find((m) => m.id === o.id)) merged.push(o);
        return merged;
      });
      setActiveJob((cur) =>
        cur
          ? {
              ...cur,
              id: r?.jobId ?? cur.id,
              status: "completed",
              progress: { stage: "completed", percent: 100, message: `Generated ${r?.outputs?.length ?? 0} image(s)` },
            }
          : cur,
      );
      toast.success(`Generated ${r?.outputs?.length ?? 0} image(s)`);
    },
    onError: (e: any) => {
      setActiveJob((cur) =>
        cur
          ? { ...cur, status: "failed", progress: { stage: "failed", percent: 100, message: e?.message ?? "Generation failed" } }
          : cur,
      );
      toast.error(e?.message ?? "Generation failed");
    },
  });

  if (!connected) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Adobe Express &amp; Firefly</CardTitle>
            <CardDescription>Connect your Adobe Firefly Services credentials first.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild><Link to="/settings/integrations">Go to Settings → Integrations</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Sparkles className="h-6 w-6" /> Adobe Express engine</h1>
        <p className="text-sm text-muted-foreground">Run Firefly Services workloads directly from your workspace. Outputs land in the standard Outputs library.</p>
      </div>

      <Tabs defaultValue="firefly">
        <TabsList>
          <TabsTrigger value="firefly"><ImageIcon className="h-4 w-4" /> Firefly text-to-image</TabsTrigger>
          <TabsTrigger value="caps"><FileImage className="h-4 w-4" /> Capabilities</TabsTrigger>
        </TabsList>

        <TabsContent value="firefly" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>New Firefly render</CardTitle>
              <CardDescription>Generates brand-safe images via Adobe Firefly v3.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label>Project</Label>
                <select className="rounded-md border bg-background p-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">Select a project…</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>Prompt</Label>
                <Textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A product photo of a matte black water bottle on a marble countertop, soft daylight, brand minimal aesthetic" />
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="grid gap-2"><Label>Width</Label><Input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} /></div>
                <div className="grid gap-2"><Label>Height</Label><Input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} /></div>
                <div className="grid gap-2">
                  <Label>Content class</Label>
                  <select className="rounded-md border bg-background p-2 text-sm" value={contentClass} onChange={(e) => setContentClass(e.target.value as any)}>
                    <option value="photo">photo</option><option value="art">art</option><option value="graphic">graphic</option>
                  </select>
                </div>
                <div className="grid gap-2"><Label>Variations</Label><Input type="number" min={1} max={4} value={n} onChange={(e) => setN(Number(e.target.value))} /></div>
              </div>
              <div>
                <Button disabled={!projectId || !prompt.trim() || runMut.isPending} onClick={() => runMut.mutate()}>
                  {runMut.isPending ? "Generating…" : "Run Firefly"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {activeJob && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                <div className="flex items-center gap-2">
                  {activeJob.status === "completed" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : activeJob.status === "failed" ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                  <CardTitle className="text-base">
                    {activeJob.status === "completed"
                      ? "Render complete"
                      : activeJob.status === "failed"
                      ? "Render failed"
                      : "Rendering with Firefly…"}
                  </CardTitle>
                </div>
                <Badge variant="outline" className="capitalize">{activeJob.progress?.stage ?? activeJob.status}</Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={activeJob.progress?.percent ?? 0} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{activeJob.progress?.message ?? "Waiting for Adobe…"}</span>
                  <span>{Math.round(activeJob.progress?.percent ?? 0)}%</span>
                </div>
              </CardContent>
            </Card>
          )}

          {outputs.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Results ({outputs.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {outputs.map((o) => (
                    <a key={o.id} href={o.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border">
                      <img src={o.url} alt="Firefly output" className="aspect-square w-full object-cover" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="caps">
          <Card>
            <CardHeader>
              <CardTitle>What you can run</CardTitle>
              <CardDescription>Firefly Services surfaces available on the <code>express</code> engine.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {(capData?.capabilities ?? []).map((c: any) => (
                  <li key={c.id} className="rounded-md border p-3">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-sm text-muted-foreground">{c.description}</div>
                    <code className="mt-1 inline-block text-[10px] text-muted-foreground">{c.id}</code>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
