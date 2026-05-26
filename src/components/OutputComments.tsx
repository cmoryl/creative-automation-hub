import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listOutputComments,
  createOutputComment,
  deleteOutputComment,
} from "@/lib/output-comments.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function OutputComments({ outputId }: { outputId: string }) {
  const listFn = useServerFn(listOutputComments);
  const createFn = useServerFn(createOutputComment);
  const deleteFn = useServerFn(deleteOutputComment);
  const qc = useQueryClient();
  const { user } = useAuth();
  const [body, setBody] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["output-comments", outputId],
    queryFn: () => listFn({ data: { outputId } }),
  });

  const post = useMutation({
    mutationFn: () => createFn({ data: { outputId, body: body.trim() } }),
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["output-comments", outputId] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4" /> Comments {data.length > 0 && <span className="text-xs text-muted-foreground">({data.length})</span>}
      </h3>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet. Be the first.</p>
      ) : (
        <ul className="space-y-2">
          {data.map((c: any) => (
            <li key={c.id} className="rounded-md border bg-card p-3 text-sm">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{c.author?.display_name ?? "Member"} · {new Date(c.created_at).toLocaleString()}</span>
                {c.author_id === user?.id && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive"
                    onClick={async () => {
                      await deleteFn({ data: { id: c.id } });
                      qc.invalidateQueries({ queryKey: ["output-comments", outputId] });
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Leave a comment for reviewers…"
          maxLength={4000}
        />
        <Button size="sm" disabled={!body.trim() || post.isPending} onClick={() => post.mutate()}>
          Post comment
        </Button>
      </div>
    </section>
  );
}
