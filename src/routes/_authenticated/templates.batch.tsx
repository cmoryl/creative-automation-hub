import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { listTemplates } from "@/lib/workspace.functions";
import { getTemplate } from "@/lib/workspace.functions";
import { dispatchBatch } from "@/lib/batch.functions";
import { createBatchSchedule } from "@/lib/batch-schedules.functions";
import { validateField } from "@/components/CreateVariationsTab";

import {
  BatchRowsTable,
  newBatchRow,
  type BatchRow,
  type BatchVariable,
} from "@/components/BatchRowsTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Layers,
  Loader2,
  Wand2,
} from "lucide-react";


export const Route = createFileRoute("/_authenticated/templates/batch")({
  component: TemplatesBatchPage,
});

const ENGINES = ["illustrator", "indesign", "figma", "canva", "claude"] as const;

const engineColor: Record<string, string> = {
  canva: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  figma: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  illustrator: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  indesign: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
};

function TemplatesBatchPage() {
  const navigate = useNavigate();
  const listFn = useServerFn(listTemplates);
  const getTplFn = useServerFn(getTemplate);
  const dispatchFn = useServerFn(dispatchBatch);
  const scheduleFn = useServerFn(createBatchSchedule);


  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => listFn(),
  });

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [engines, setEngines] = useState<Set<string>>(new Set(["illustrator"]));
  const [rows, setRows] = useState<BatchRow[]>([newBatchRow()]);
  const [batchLabel, setBatchLabel] = useState(
    `Multi-template batch ${new Date().toLocaleDateString()}`,
  );
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});

  // Fetch full variable lists for each selected template
  const tplQueries = useQuery({
    queryKey: ["templates-batch-vars", Array.from(selectedIds).sort()],
    queryFn: async () => {
      const out: Record<string, BatchVariable[]> = {};
      for (const id of selectedIds) {
        const t = await getTplFn({ data: { id } });
        out[id] = ((t?.template?.variables as BatchVariable[] | null) ?? []);
      }
      return out;
    },
    enabled: selectedIds.size > 0 && step >= 3,
  });

  // Union of variables across selected templates
  const unionVars: BatchVariable[] = useMemo(() => {
    if (!tplQueries.data) return [];
    const seen = new Map<string, BatchVariable>();
    for (const list of Object.values(tplQueries.data)) {
      for (const v of list) if (!seen.has(v.name)) seen.set(v.name, v);
    }
    return Array.from(seen.values());
  }, [tplQueries.data]);

  const selectedTemplates = templates.filter((t) => selectedIds.has(t.id));

  const dispatch = useMutation({
    mutationFn: async () => {
      if (!selectedTemplates.length) throw new Error("Pick at least one template");
      if (engines.size === 0) throw new Error("Pick at least one engine");
      if (!rows.length) throw new Error("Add at least one row");
      if (!batchLabel.trim()) throw new Error("Name your batch");

      // Validate every row against the union vars
      const newErrs: Record<string, Record<string, string>> = {};
      rows.forEach((r, i) => {
        const re: Record<string, string> = {};
        if (!r.label.trim()) re.__label = `Row ${i + 1} needs a label`;
        for (const v of unionVars) {
          const e = validateField(v, r.values[v.name] ?? "");
          if (e) re[v.name] = e;
        }
        if (Object.keys(re).length) newErrs[r.id] = re;
      });
      setErrors(newErrs);
      if (Object.keys(newErrs).length) {
        throw new Error(
          `${Object.keys(newErrs).length} row(s) have errors — fix before dispatching`,
        );
      }

      const engineList = Array.from(engines).filter((e) =>
        // only include engines that at least one selected template supports
        selectedTemplates.some((t) => t.engine === e),
      );
      if (!engineList.length) {
        throw new Error("None of the selected templates support the chosen engines");
      }

      const groups = selectedTemplates
        .filter((t) => engineList.includes(t.engine))
        .map((t) => {
          const tplVars = tplQueries.data?.[t.id] ?? [];
          const tplVarNames = new Set(tplVars.map((v) => v.name));
          return {
            templateId: t.id,
            engines: [t.engine] as never,
            rows: rows.map((r) => {
              const values: Record<string, string> = {};
              for (const name of tplVarNames) {
                if (r.values[name] != null) values[name] = r.values[name];
              }
              return { label: r.label.trim(), values };
            }),
          };
        });

      return dispatchFn({
        data: { batchLabel: batchLabel.trim(), groups },
      });
    },
    onSuccess: (res) => {
      toast.success(`Created ${res.totalJobs} job(s) across ${res.created.length} variation(s)`);
      navigate({ to: "/batches/$batchId", params: { batchId: res.batchId } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Dispatch failed"),
  });

  const intersectionEngines = useMemo(() => {
    const all = new Set(ENGINES);
    if (!selectedTemplates.length) return all;
    const supported = new Set(selectedTemplates.map((t) => t.engine));
    return supported;
  }, [selectedTemplates]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 -ml-2"
        onClick={() => navigate({ to: "/templates" })}
      >
        <ArrowLeft className="h-4 w-4" /> Back to templates
      </Button>

      <header className="mb-6">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Batch dispatch</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick multiple templates and dispatch the same set of rows across all of them.
        </p>
      </header>

      {/* Stepper */}
      <div className="mb-6 flex items-center gap-3 text-sm">
        {([1, 2, 3] as const).map((n, i) => {
          const labels = ["Templates", "Engines", "Rows"];
          const active = step === n;
          const done = step > n;
          return (
            <div key={n} className="flex items-center gap-3">
              <button
                onClick={() => (done || active ? setStep(n) : null)}
                className={`flex items-center gap-2 rounded-full px-3 py-1 ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span>{n}</span>}
                {labels[i]}
              </button>
              {i < 2 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            </div>
          );
        })}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="text-sm font-medium">Select templates</div>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {templates.map((t) => {
                  const on = selectedIds.has(t.id);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedIds((s) => {
                            const next = new Set(s);
                            next.has(t.id) ? next.delete(t.id) : next.add(t.id);
                            return next;
                          })
                        }
                        className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
                          on ? "border-primary bg-primary/5" : "hover:border-primary/50"
                        }`}
                      >
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                            on ? "border-primary bg-primary text-primary-foreground" : ""
                          }`}
                        >
                          {on && <CheckCircle2 className="h-3.5 w-3.5" />}
                        </div>
                        {t.preview_url && (
                          <img
                            src={t.preview_url}
                            alt={t.name}
                            className="h-12 w-16 rounded object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{t.name}</div>
                          <span
                            className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] ${engineColor[t.engine] ?? "bg-muted"}`}
                          >
                            {t.engine}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex justify-end">
              <Button
                disabled={selectedIds.size === 0}
                onClick={() => setStep(2)}
              >
                Next: engines <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="text-sm font-medium">Pick engines</div>
            <p className="text-xs text-muted-foreground">
              Templates only render in their native engine. Available across your
              selection: {Array.from(intersectionEngines).join(", ")}.
            </p>
            <div className="flex flex-wrap gap-2">
              {ENGINES.map((e) => {
                const supported = intersectionEngines.has(e);
                const on = engines.has(e);
                return (
                  <Badge
                    key={e}
                    variant={on ? "default" : "outline"}
                    className={`cursor-pointer ${!supported ? "opacity-40" : ""}`}
                    onClick={() => {
                      if (!supported) return;
                      setEngines((s) => {
                        const next = new Set(s);
                        next.has(e) ? next.delete(e) : next.add(e);
                        return next;
                      });
                    }}
                  >
                    {e}
                  </Badge>
                );
              })}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button disabled={engines.size === 0} onClick={() => setStep(3)}>
                Next: rows <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Batch name</label>
              <Input
                value={batchLabel}
                onChange={(e) => setBatchLabel(e.target.value)}
              />
            </div>

            {tplQueries.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading template fields…</p>
            ) : unionVars.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Selected templates have no editable variables.
              </p>
            ) : (
              <>
                <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                  {unionVars.length} field(s) across {selectedTemplates.length} template(s).
                  Each template will only receive the fields it knows about.
                </div>
                <BatchRowsTable
                  variables={unionVars}
                  rows={rows}
                  onChange={setRows}
                  errors={errors}
                />
              </>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                disabled={dispatch.isPending}
                onClick={() => dispatch.mutate()}
              >
                {dispatch.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}{" "}
                Dispatch · {selectedTemplates.length} template(s) × {rows.length} row(s)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 text-xs text-muted-foreground">
        See all batches on the{" "}
        <Link to="/batches" className="text-primary hover:underline">
          batches dashboard
        </Link>
        .
      </div>
    </div>
  );
}
