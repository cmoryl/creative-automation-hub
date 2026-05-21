import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Plug, ExternalLink } from "lucide-react";
import {
  listIntegrations,
  saveCanvaCredentials,
  disconnectIntegration,
} from "@/lib/integrations.functions";
import {
  startCanvaOAuth,
  listCanvaBrandTemplates,
  listCanvaDesigns,
  importCanvaTemplate,
  ensureCanvaWebhookSecret,
} from "@/lib/canva.functions";
import { saveFigmaToken } from "@/lib/figma.functions";

export const Route = createFileRoute("/_authenticated/settings/integrations")({
  component: IntegrationsPage,
});

type Integ = { provider: string; metadata: any; updated_at: string };

function IntegrationsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listIntegrations);
  const { data: integrations = [] } = useQuery<Integ[]>({
    queryKey: ["integrations"],
    queryFn: () => list() as any,
  });

  const byProvider = Object.fromEntries(integrations.map((i) => [i.provider, i]));
  const refresh = () => qc.invalidateQueries({ queryKey: ["integrations"] });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect the design tools you use. Figma and Canva run from the cloud. Illustrator and InDesign run through the local bridge agent.
        </p>
      </div>

      <FigmaCard connected={byProvider["figma"]} onChange={refresh} />
      <CanvaCard connected={byProvider["canva"]} onChange={refresh} />
      <BridgeCard
        provider="illustrator"
        title="Adobe Illustrator"
        description="Generate .ai live files and PDF/PNG exports. Requires the local bridge agent running on a machine with Illustrator installed."
      />
      <BridgeCard
        provider="indesign"
        title="Adobe InDesign"
        description="Generate .indd live files, IDML, and press-ready PDFs. Requires the local bridge agent running on a machine with InDesign installed."
      />
    </div>
  );
}

function StatusBadge({ connected }: { connected?: Integ }) {
  return connected ? (
    <Badge variant="secondary" className="gap-1">
      <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Connected
    </Badge>
  ) : (
    <Badge variant="outline">Not connected</Badge>
  );
}

function FigmaCard({ connected, onChange }: { connected?: Integ; onChange: () => void }) {
  const save = useServerFn(saveFigmaToken);
  const disconnect = useServerFn(disconnectIntegration);
  const [token, setToken] = useState("");

  const saveMut = useMutation({
    mutationFn: async (t: string) => save({ data: { token: t } }),
    onSuccess: (res) => {
      toast.success(`Figma connected${res?.handle ? ` as @${res.handle}` : ""}`);
      setToken("");
      onChange();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to connect Figma"),
  });
  const delMut = useMutation({
    mutationFn: async () => disconnect({ data: { provider: "figma" } }),
    onSuccess: () => { toast.success("Figma disconnected"); onChange(); },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Figma</CardTitle>
          <CardDescription>
            Personal Access Token. {connected?.metadata?.handle && `Connected as @${connected.metadata.handle}.`}
          </CardDescription>
        </div>
        <StatusBadge connected={connected} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2">
          <Label htmlFor="figma-token">Personal Access Token</Label>
          <div className="flex gap-2">
            <Input
              id="figma-token"
              type="password"
              placeholder="figd_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Button
              disabled={!token.trim() || saveMut.isPending}
              onClick={() => saveMut.mutate(token.trim())}
            >
              <Plug className="h-4 w-4" /> {connected ? "Replace" : "Connect"}
            </Button>
            {connected && (
              <Button variant="outline" onClick={() => delMut.mutate()}>Disconnect</Button>
            )}
          </div>
          <a
            href="https://www.figma.com/developers/api#access-tokens"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            Create a Figma PAT <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function CanvaCard({ connected, onChange }: { connected?: Integ; onChange: () => void }) {
  const save = useServerFn(saveCanvaCredentials);
  const disconnect = useServerFn(disconnectIntegration);
  const startOAuth = useServerFn(startCanvaOAuth);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const saveMut = useMutation({
    mutationFn: async () => save({ data: { clientId: clientId.trim(), clientSecret: clientSecret.trim() } }),
    onSuccess: () => {
      toast.success("Canva credentials saved");
      setClientId(""); setClientSecret("");
      onChange();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save Canva credentials"),
  });
  const delMut = useMutation({
    mutationFn: async () => disconnect({ data: { provider: "canva" } }),
    onSuccess: () => { toast.success("Canva disconnected"); onChange(); },
  });
  const authMut = useMutation({
    mutationFn: async () => (startOAuth as any)({ data: { origin: window.location.origin } }),
    onSuccess: (res: any) => {
      if (res?.authorizeUrl) window.location.href = res.authorizeUrl;
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to start Canva authorization"),
  });

  const redirectUri = typeof window !== "undefined"
    ? `${window.location.origin}/api/public/oauth/canva/callback`
    : "";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Canva Connect</CardTitle>
          <CardDescription>
            Paste your Canva Developer App credentials. OAuth user authorization is a separate step once these are saved.
          </CardDescription>
        </div>
        <StatusBadge connected={connected} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="canva-client-id">Client ID</Label>
          <Input
            id="canva-client-id"
            placeholder={connected?.metadata?.client_id ?? "OC-AZ…"}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="canva-client-secret">Client Secret</Label>
          <Input
            id="canva-client-secret"
            type="password"
            placeholder="cnvca…"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
          />
        </div>
        <div className="rounded-md border bg-muted/40 p-3 text-xs">
          <div className="mb-1 font-medium">Redirect URI (add this in your Canva app)</div>
          <code className="break-all">{redirectUri}</code>
        </div>
        {connected?.metadata?.status === "connected" && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
            <div className="font-medium text-emerald-400">✓ Canva account authorized</div>
            {connected.metadata.connected_at && (
              <div className="mt-0.5 text-muted-foreground">
                Connected {new Date(connected.metadata.connected_at).toLocaleString()}
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!clientId.trim() || !clientSecret.trim() || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            <Plug className="h-4 w-4" /> {connected ? "Replace credentials" : "Save credentials"}
          </Button>
          {connected && (
            <Button
              variant="secondary"
              disabled={authMut.isPending}
              onClick={() => authMut.mutate()}
            >
              {connected.metadata?.status === "connected" ? "Re-authorize Canva" : "Authorize Canva account"}
            </Button>
          )}
          {connected && (
            <Button variant="outline" onClick={() => delMut.mutate()}>Disconnect</Button>
          )}
          <a
            href="https://www.canva.dev/docs/connect/"
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 self-center text-xs text-muted-foreground hover:underline"
          >
            Canva Connect docs <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {connected?.metadata?.status === "connected" && (
          <CanvaAdvancedPanel />
        )}
      </CardContent>
    </Card>
  );
}

function CanvaAdvancedPanel() {
  const listBT = useServerFn(listCanvaBrandTemplates);
  const listDs = useServerFn(listCanvaDesigns);
  const importFn = useServerFn(importCanvaTemplate);
  const webhookFn = useServerFn(ensureCanvaWebhookSecret);
  const qc = useQueryClient();
  const [importing, setImporting] = useState<string | null>(null);
  const [webhook, setWebhook] = useState<{ url: string; secret: string } | null>(null);

  const bt = useQuery({
    queryKey: ["canva-brand-templates"],
    queryFn: () => listBT({ data: {} }) as any,
  });
  const ds = useQuery({
    queryKey: ["canva-designs"],
    queryFn: () => listDs({ data: {} }) as any,
  });

  const doImport = async (kind: "brand_template" | "design", id: string, label: string) => {
    setImporting(id);
    try {
      await importFn({ data: { kind, id } });
      toast.success(`Imported "${label}" as a template`);
      qc.invalidateQueries({ queryKey: ["templates"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally {
      setImporting(null);
    }
  };

  const revealWebhook = async () => {
    try {
      const r: any = await webhookFn({ data: {} });
      const url = `${window.location.origin}${r.url}`;
      setWebhook({ url, secret: r.secret });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => bt.refetch()} disabled={bt.isFetching}>
          {bt.isFetching ? "Syncing…" : "Sync brand templates"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => ds.refetch()} disabled={ds.isFetching}>
          {ds.isFetching ? "Syncing…" : "Sync designs"}
        </Button>
        <Button size="sm" variant="outline" onClick={revealWebhook}>
          Reveal webhook URL & secret
        </Button>
      </div>

      {bt.error && (
        <p className="text-xs text-destructive">Brand templates: {(bt.error as any).message}</p>
      )}
      {bt.data?.items?.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
            Brand templates ({bt.data.items.length})
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {bt.data.items.slice(0, 12).map((it: any) => (
              <li key={it.id} className="flex items-center gap-2 rounded-md border p-2">
                {it.thumbnail && <img src={it.thumbnail} alt="" className="h-10 w-14 rounded object-cover" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{it.title || it.id}</div>
                  <code className="text-[10px] text-muted-foreground">{it.id}</code>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={importing === it.id}
                  onClick={() => doImport("brand_template", it.id, it.title || it.id)}
                >
                  {importing === it.id ? "…" : "Import"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ds.data?.items?.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
            Recent designs ({ds.data.items.length})
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {ds.data.items.slice(0, 12).map((it: any) => (
              <li key={it.id} className="flex items-center gap-2 rounded-md border p-2">
                {it.thumbnail && <img src={it.thumbnail} alt="" className="h-10 w-14 rounded object-cover" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{it.title || it.id}</div>
                  <code className="text-[10px] text-muted-foreground">{it.id}</code>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={importing === it.id}
                  onClick={() => doImport("design", it.id, it.title || it.id)}
                >
                  {importing === it.id ? "…" : "Import"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {webhook && (
        <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-2">
          <div>
            <div className="mb-1 font-medium">Webhook URL</div>
            <code className="break-all">{webhook.url}</code>
          </div>
          <div>
            <div className="mb-1 font-medium">Signing secret</div>
            <code className="break-all">{webhook.secret}</code>
            <p className="mt-1 text-muted-foreground">
              In Canva's developer portal → Webhooks, paste this URL and use this secret for HMAC-SHA256 signing (header <code>x-canva-signature</code>).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function BridgeCard({
  provider,
  title,
  description,
}: {
  provider: "illustrator" | "indesign";
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Badge variant="outline">Via local agent</Badge>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link to="/settings/agent">Manage local agent →</Link>
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Once an agent is paired, queued <code>{provider}</code> jobs are automatically picked up by it.
        </p>
      </CardContent>
    </Card>
  );
}
