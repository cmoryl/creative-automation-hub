import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listWebhooks,
  createWebhook,
  toggleWebhook,
  deleteWebhook,
  listWebhookDeliveries,
} from "@/lib/webhooks.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Webhook, Trash2, Copy, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/webhooks")({
  component: WebhooksPage,
});

const ALL_EVENTS = [
  { v: "job.completed", l: "Job completed" },
  { v: "job.failed", l: "Job failed" },
  { v: "approval.decided", l: "Approval decided" },
  { v: "batch.dispatched", l: "Batch dispatched" },
] as const;

function WebhooksPage() {
  const listFn = useServerFn(listWebhooks);
  const createFn = useServerFn(createWebhook);
  const toggleFn = useServerFn(toggleWebhook);
  const deleteFn = useServerFn(deleteWebhook);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["webhooks"], queryFn: () => listFn() });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["job.completed", "job.failed"]);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          name: name.trim(),
          url: url.trim(),
          events: events as ("job.completed" | "job.failed" | "approval.decided" | "batch.dispatched")[],
        },
      }),
    onSuccess: (res) => {
      setCreatedSecret(res.secret);
      setName(""); setUrl("");
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook created");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Webhook className="h-5 w-5 text-primary" /> Webhooks
          </h1>
          <p className="text-sm text-muted-foreground">
            Receive HTTP POST notifications when jobs complete, fail, or batches dispatch. Each
            payload is signed with HMAC-SHA256 in the <code>x-cap-signature</code> header.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setCreatedSecret(null); }}>
          <DialogTrigger asChild><Button>Add webhook</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{createdSecret ? "Webhook created" : "New webhook"}</DialogTitle></DialogHeader>
            {createdSecret ? (
              <div className="space-y-3">
                <p className="text-sm">Copy your signing secret now — you won't see it again.</p>
                <div className="flex items-center gap-2 rounded border bg-muted/40 p-2 font-mono text-xs">
                  <span className="flex-1 truncate">{createdSecret}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(createdSecret);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <Button className="w-full" onClick={() => { setOpen(false); setCreatedSecret(null); }}>Done</Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium">Name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Production" />
                </div>
                <div>
                  <label className="text-xs font-medium">URL</label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/webhooks/cap" />
                </div>
                <div>
                  <label className="text-xs font-medium">Events</label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {ALL_EVENTS.map((e) => {
                      const on = events.includes(e.v);
                      return (
                        <Badge
                          key={e.v}
                          variant={on ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() =>
                            setEvents((s) => (s.includes(e.v) ? s.filter((x) => x !== e.v) : [...s, e.v]))
                          }
                        >
                          {e.l}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={createMut.isPending || !name.trim() || !url.trim() || !events.length}
                  onClick={() => createMut.mutate()}
                >
                  Create
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </header>

      {data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No webhooks yet. Add one to receive job notifications.
        </div>
      ) : (
        <ul className="space-y-3">
          {data.map((w) => <WebhookRow key={w.id} w={w} onToggle={(active) => toggleFn({ data: { id: w.id, active } }).then(() => qc.invalidateQueries({ queryKey: ["webhooks"] }))} onDelete={async () => { await deleteFn({ data: { id: w.id } }); qc.invalidateQueries({ queryKey: ["webhooks"] }); toast.success("Deleted"); }} />)}
        </ul>
      )}
    </div>
  );
}

function WebhookRow({ w, onToggle, onDelete }: { w: any; onToggle: (active: boolean) => void; onDelete: () => void }) {
  const listDeliveries = useServerFn(listWebhookDeliveries);
  const [open, setOpen] = useState(false);
  const { data: deliveries = [] } = useQuery({
    queryKey: ["webhook-deliveries", w.id],
    queryFn: () => listDeliveries({ data: { webhookId: w.id, limit: 25 } }),
    enabled: open,
  });
  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        <Switch checked={w.active} onCheckedChange={onToggle} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{w.name}</span>
            {(w.events as string[]).map((e) => <Badge key={e} variant="outline" className="text-[10px]">{e}</Badge>)}
          </div>
          <p className="truncate text-xs text-muted-foreground">{w.url}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Deliveries"}
        </Button>
        <Button size="icon" variant="ghost" className="text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {open && (
        <div className="mt-3 border-t pt-3 text-xs">
          {deliveries.length === 0 ? (
            <p className="text-muted-foreground">No deliveries yet.</p>
          ) : (
            <ul className="divide-y">
              {deliveries.map((d: any) => (
                <li key={d.id} className="flex items-center gap-2 py-1.5">
                  <span className={`h-2 w-2 rounded-full ${d.ok ? "bg-emerald-500" : "bg-destructive"}`} />
                  <span className="font-mono">{d.event}</span>
                  <span className="text-muted-foreground">→ {d.status_code ?? "—"}</span>
                  <span className="text-muted-foreground">{d.duration_ms}ms</span>
                  {d.error && <span className="truncate text-destructive">{d.error}</span>}
                  <span className="ml-auto text-muted-foreground">{new Date(d.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
