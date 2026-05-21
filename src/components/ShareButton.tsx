import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { createShareLink } from "@/lib/share-links.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Share2, Copy, Check } from "lucide-react";

export function ShareButton(props: { kind: "output" | "batch"; outputId?: string; batchKey?: string; size?: "sm" | "icon" | "default" }) {
  const create = useServerFn(createShareLink);
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const make = async () => {
    setBusy(true);
    try {
      const res: any = await create({
        data: {
          kind: props.kind,
          outputId: props.outputId,
          batchKey: props.batchKey,
          expiresInDays: days,
        },
      });
      setLink(`${window.location.origin}${res.url}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setLink(null); setCopied(false); } }}>
      <DialogTrigger asChild>
        <Button size={props.size ?? "sm"} variant="outline" onClick={(e) => e.stopPropagation()}>
          <Share2 className="h-4 w-4" /> {props.size === "icon" ? "" : "Share"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Share {props.kind}</DialogTitle></DialogHeader>
        {link ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded border bg-muted/40 p-2 font-mono text-xs">
              <span className="flex-1 truncate">{link}</span>
              <Button
                size="sm" variant="ghost"
                onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Anyone with the link can view this {props.kind}. Expires in {days} day{days === 1 ? "" : "s"}.
              Revoke from the workspace audit log.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">Create a public, read-only link.</p>
            <div>
              <label className="text-xs font-medium">Expires in</label>
              <select
                className="mt-1 w-full rounded border bg-background p-2 text-sm"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                <option value={1}>1 day</option>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>
            <Button disabled={busy} onClick={make} className="w-full">Generate link</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
