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

  const { data: projects = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["projects-for-express"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id, name").order("created_at", { ascending: false }).limit(50);
      return (data ?? []) as any;
    },
  });

  const runMut = useMutation({
    mutationFn: async () => (run as any)({
      data: { projectId, mode: "firefly", prompt, variables: {}, size: { width, height }, contentClass, numVariations: n },
    }),
    onSuccess: (r: any) => { setOutputs(r?.outputs ?? []); toast.success(`Generated ${r?.outputs?.length ?? 0} image(s)`); },
    onError: (e: any) => toast.error(e?.message ?? "Generation failed"),
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

          {outputs.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Results</CardTitle></CardHeader>
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
