import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Copy, FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { parseCsv, normaliseKey } from "@/lib/csv-parse";


export type BatchVariable = {
  name: string;
  label?: string;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
};

export type BatchRow = {
  id: string;
  label: string;
  values: Record<string, string>;
};

export function newBatchRow(prefill: Record<string, string> = {}): BatchRow {
  return {
    id: crypto.randomUUID(),
    label: "",
    values: { ...prefill },
  };
}

export function BatchRowsTable({
  variables,
  rows,
  onChange,
  errors,
  emptyHint,
}: {
  variables: BatchVariable[];
  rows: BatchRow[];
  onChange: (next: BatchRow[]) => void;
  errors?: Record<string, Record<string, string>>; // rowId -> field -> msg
  emptyHint?: string;
}) {
  const cols = useMemo(() => variables, [variables]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCsv = async (file: File) => {
    try {
      const text = await file.text();
      const grid = parseCsv(text);
      if (grid.length < 2) throw new Error("CSV needs a header row and at least one data row");
      const headers = grid[0].map((h) => h.trim());
      const normHeaders = headers.map(normaliseKey);
      const labelIdx = (() => {
        const cands = ["label", "row", "row_label", "name", "variation"];
        for (const c of cands) {
          const i = normHeaders.indexOf(c);
          if (i >= 0) return i;
        }
        return 0;
      })();
      // build header -> variable.name map
      const varByKey = new Map(variables.map((v) => [normaliseKey(v.name), v.name]));
      const colMap = normHeaders.map((h) => varByKey.get(h) ?? null);
      const out: BatchRow[] = grid.slice(1).map((cells) => {
        const values: Record<string, string> = {};
        cells.forEach((cell, i) => {
          const varName = colMap[i];
          if (varName && i !== labelIdx) values[varName] = cell;
        });
        return { id: crypto.randomUUID(), label: (cells[labelIdx] ?? "").trim() || `Row ${Math.random().toString(36).slice(2, 6)}`, values };
      });
      if (!out.length) throw new Error("No data rows parsed from CSV");
      onChange(out);
      const matched = colMap.filter(Boolean).length;
      toast.success(`Imported ${out.length} row(s), matched ${matched}/${variables.length} field(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "CSV import failed");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };


  const update = (rowId: string, patch: Partial<BatchRow>) =>
    onChange(rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));

  const updateValue = (rowId: string, name: string, value: string) =>
    onChange(
      rows.map((r) =>
        r.id === rowId ? { ...r, values: { ...r.values, [name]: value } } : r,
      ),
    );

  const duplicate = (rowId: string) => {
    const idx = rows.findIndex((r) => r.id === rowId);
    if (idx < 0) return;
    const src = rows[idx];
    const copy: BatchRow = {
      ...src,
      id: crypto.randomUUID(),
      label: src.label ? `${src.label} (copy)` : "",
      values: { ...src.values },
    };
    const next = [...rows];
    next.splice(idx + 1, 0, copy);
    onChange(next);
  };

  const remove = (rowId: string) => onChange(rows.filter((r) => r.id !== rowId));

  const csvInput = (
    <input
      ref={fileRef}
      type="file"
      accept=".csv,.tsv,text/csv,text/tab-separated-values"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) handleCsv(f);
      }}
    />
  );

  if (!rows.length) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        {emptyHint ?? "No rows yet. Add one to get started."}
        <div className="mt-3 flex justify-center gap-2">
          <Button size="sm" variant="outline" onClick={() => onChange([newBatchRow()])}>
            <Plus className="h-3.5 w-3.5" /> Add row
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Import CSV
          </Button>
          {csvInput}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row, i) => {
        const rowErrs = errors?.[row.id] ?? {};
        const labelErr = rowErrs.__label;
        return (
          <div key={row.id} className="rounded-md border bg-card">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5">
              <div className="flex flex-1 items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  #{i + 1}
                </span>
                <Input
                  className={`h-7 max-w-[280px] text-xs ${labelErr ? "border-destructive" : ""}`}
                  placeholder="Row label (e.g. Client A — Australia)"
                  value={row.label}
                  onChange={(e) => update(row.id, { label: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="Duplicate row"
                  onClick={() => duplicate(row.id)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  title="Delete row"
                  onClick={() => remove(row.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="grid gap-2 p-3 md:grid-cols-2">
              {cols.map((v) => {
                const val = row.values[v.name] ?? "";
                const err = rowErrs[v.name];
                const errBorder = err
                  ? "border-destructive focus-visible:ring-destructive"
                  : "";
                const multiline =
                  v.multiline ||
                  /challenge|solution|results|quote|body|description/i.test(v.name);
                return (
                  <div key={v.name} className="space-y-0.5">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {v.label ?? v.name}
                    </label>
                    {v.type === "color" ? (
                      <Input
                        type="color"
                        value={val || "#0066cc"}
                        onChange={(e) => updateValue(row.id, v.name, e.target.value)}
                        className={`h-9 ${errBorder}`}
                      />
                    ) : multiline ? (
                      <Textarea
                        rows={2}
                        placeholder={v.placeholder ?? v.label ?? v.name}
                        value={val}
                        onChange={(e) => updateValue(row.id, v.name, e.target.value)}
                        className={errBorder}
                      />
                    ) : (
                      <Input
                        placeholder={v.placeholder ?? v.label ?? v.name}
                        value={val}
                        onChange={(e) => updateValue(row.id, v.name, e.target.value)}
                        className={errBorder}
                      />
                    )}
                    {err && <p className="text-[10px] text-destructive">{err}</p>}
                  </div>
                );
              })}
            </div>
            {labelErr && (
              <p className="px-3 pb-2 text-[10px] text-destructive">{labelErr}</p>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange([...rows, newBatchRow()])}
        >
          <Plus className="h-3.5 w-3.5" /> Add row
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const last = rows[rows.length - 1];
            onChange([
              ...rows,
              {
                ...last,
                id: crypto.randomUUID(),
                label: last.label ? `${last.label} (copy)` : "",
                values: { ...last.values },
              },
            ]);
          }}
        >
          <Copy className="h-3.5 w-3.5" /> Duplicate last
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <FileSpreadsheet className="h-3.5 w-3.5" /> Import CSV
        </Button>
        {csvInput}
      </div>
    </div>
  );
}
