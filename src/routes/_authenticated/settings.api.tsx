import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trash2, Copy, KeyRound } from "lucide-react";
import {
  listApiTokens,
  createApiToken,
  deleteApiToken,
} from "@/lib/api-tokens.functions";

export const Route = createFileRoute("/_authenticated/settings/api")({
  component: ApiSettings,
});

function ApiSettings() {
  const qc = useQueryClient();
  const list = useServerFn(listApiTokens);
  const create = useServerFn(createApiToken);
  const del = useServerFn(deleteApiToken);

  const { data: tokens = [] } = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => list(),
  });

  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: async (n: string) => create({ data: { name: n } }),
    onSuccess: (res) => {
      setRevealed(res.token);
      setName("");
      qc.invalidateQueries({ queryKey: ["api-tokens"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create token"),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-tokens"] }),
  });

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">API tokens</h1>
        <p className="text-sm text-muted-foreground">
          Tokens for external clients (Claude skill, Claude Code, CI) to create jobs and read outputs in this workspace.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create token</CardTitle>
          <CardDescription>The token is shown once. Store it securely.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. claude-skill-laptop"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              disabled={!name.trim() || createMut.isPending}
              onClick={() => createMut.mutate(name.trim())}
            >
              Generate
            </Button>
          </div>
          {revealed && (
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <KeyRound className="h-4 w-4" /> Copy now — you won't see it again
              </div>
              <div className="flex gap-2">
                <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">{revealed}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(revealed);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active tokens</CardTitle>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tokens yet.</p>
          ) : (
            <ul className="divide-y">
              {tokens.map((t: any) => (
                <li key={t.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Created {new Date(t.created_at).toLocaleString()} ·{" "}
                      {t.last_used_at ? `last used ${new Date(t.last_used_at).toLocaleString()}` : "never used"}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => delMut.mutate(t.id)}
                    aria-label="Revoke token"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick reference</CardTitle>
          <CardDescription>Base URL: <code>{baseUrl}</code></CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="font-medium">Create a job</div>
            <pre className="overflow-x-auto rounded bg-muted/40 p-3 text-xs">
{`curl -X POST ${baseUrl}/api/public/v1/jobs \\
  -H "Authorization: Bearer cap_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "<uuid>",
    "engine": "hybrid",
    "templateId": "<uuid>",
    "brief": { "headline": "Spring sale" },
    "variables": { "locale": "en-US" }
  }'`}
            </pre>
          </div>
          <div>
            <div className="font-medium">Poll a job + outputs</div>
            <pre className="overflow-x-auto rounded bg-muted/40 p-3 text-xs">
{`curl ${baseUrl}/api/public/v1/jobs/<jobId> \\
  -H "Authorization: Bearer cap_xxx"`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
