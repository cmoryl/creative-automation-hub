import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Search, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listCanvaBrandTemplates,
  listCanvaDesigns,
  importCanvaTemplate,
} from "@/lib/canva.functions";
import { listCompanies } from "@/lib/brand.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/templates/canva")({
  component: CanvaBrowserPage,
});

type Item = { id: string; title: string; thumbnail: string | null };

function CanvaBrowserPage() {
  const fetchBrand = useServerFn(listCanvaBrandTemplates);
  const fetchDesigns = useServerFn(listCanvaDesigns);
  const fetchCompanies = useServerFn(listCompanies);
  const importFn = useServerFn(importCanvaTemplate);

  const [tab, setTab] = useState<"brand_template" | "design">("brand_template");
  const [search, setSearch] = useState("");
  const [designQuery, setDesignQuery] = useState("");
  const [companyId, setCompanyId] = useState<string>("none");
  const [productId, setProductId] = useState<string>("none");
  const [brandPages, setBrandPages] = useState<{ items: Item[]; cont: string | null }>({
    items: [],
    cont: null,
  });
  const [designPages, setDesignPages] = useState<{ items: Item[]; cont: string | null }>({
    items: [],
    cont: null,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());

  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: () => fetchCompanies(),
  });

  const brandInitial = useQuery({
    queryKey: ["canva-brand-templates-initial"],
    queryFn: async () => {
      const r = await fetchBrand({ data: {} });
      setBrandPages({ items: r.items, cont: r.continuation });
      return r;
    },
  });

  const designInitial = useQuery({
    queryKey: ["canva-designs-initial", designQuery],
    queryFn: async () => {
      const r = await fetchDesigns({ data: { query: designQuery || undefined } });
      setDesignPages({ items: r.items, cont: r.continuation });
      return r;
    },
  });

  const productsForCompany = useMemo(() => {
    if (companyId === "none") return [];
    const c = companies.data?.find((c: any) => c.id === companyId);
    if (!c) return [];
    const flat: { id: string; name: string }[] = [];
    for (const p of c.products ?? []) {
      flat.push({ id: p.id, name: p.name });
      for (const sp of p.subProducts ?? []) flat.push({ id: sp.id, name: `${p.name} › ${sp.name}` });
    }
    return flat;
  }, [companies.data, companyId]);

  const filteredBrand = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return brandPages.items;
    return brandPages.items.filter((i) => i.title.toLowerCase().includes(q));
  }, [brandPages.items, search]);

  const loadMoreBrand = async () => {
    if (!brandPages.cont) return;
    setLoadingMore(true);
    try {
      const r = await fetchBrand({ data: { continuation: brandPages.cont } });
      setBrandPages({ items: [...brandPages.items, ...r.items], cont: r.continuation });
    } finally {
      setLoadingMore(false);
    }
  };

  const loadMoreDesigns = async () => {
    if (!designPages.cont) return;
    setLoadingMore(true);
    try {
      const r = await fetchDesigns({
        data: { query: designQuery || undefined, continuation: designPages.cont },
      });
      setDesignPages({ items: [...designPages.items, ...r.items], cont: r.continuation });
    } finally {
      setLoadingMore(false);
    }
  };

  const doImport = async (kind: "brand_template" | "design", id: string) => {
    setImporting(id);
    try {
      await importFn({
        data: {
          kind,
          id,
          companyId: companyId === "none" ? null : companyId,
          productId: productId === "none" ? null : productId,
        },
      });
      setImported((s) => new Set(s).add(id));
      toast.success("Imported to template registry");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(null);
    }
  };

  const items = tab === "brand_template" ? filteredBrand : designPages.items;
  const cont = tab === "brand_template" ? brandPages.cont : designPages.cont;
  const loading =
    tab === "brand_template" ? brandInitial.isLoading : designInitial.isLoading;
  const error = tab === "brand_template" ? brandInitial.error : designInitial.error;

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-3">
        <Link to="/templates"><ArrowLeft className="h-4 w-4" /> Back to templates</Link>
      </Button>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Browse Canva</h1>
        <p className="text-sm text-muted-foreground">
          Search your connected Canva workspace and import brand templates or designs.
          Assign a brand/product before importing so the template is discoverable from the
          brands page.
        </p>
      </header>

      {/* Brand assignment */}
      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2">
        <div>
          <label className="text-xs font-medium">Assign to brand</label>
          <Select
            value={companyId}
            onValueChange={(v) => {
              setCompanyId(v);
              setProductId("none");
            }}
          >
            <SelectTrigger><SelectValue placeholder="No brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No brand (workspace-wide)</SelectItem>
              {(companies.data ?? []).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Product (optional)</label>
          <Select value={productId} onValueChange={setProductId} disabled={companyId === "none"}>
            <SelectTrigger><SelectValue placeholder="No product" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No product</SelectItem>
              {productsForCompany.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="brand_template">Brand Templates</TabsTrigger>
          <TabsTrigger value="design">Designs</TabsTrigger>
        </TabsList>

        <TabsContent value="brand_template" className="mt-4">
          <div className="relative mb-4">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter loaded brand templates by title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </TabsContent>

        <TabsContent value="design" className="mt-4">
          <form
            className="mb-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              designInitial.refetch();
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search Canva designs…"
                value={designQuery}
                onChange={(e) => setDesignQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="outline">Search</Button>
          </form>
        </TabsContent>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading from Canva…</p>
        ) : error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">Couldn't reach Canva.</p>
            <p className="mt-1 text-muted-foreground">
              {error instanceof Error ? error.message : "Unknown error"}. Connect Canva from{" "}
              <Link to="/settings/integrations" className="underline">Settings → Integrations</Link>.
            </p>
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing found.</p>
        ) : (
          <>
            <ul className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
              {items.map((it) => {
                const isImported = imported.has(it.id);
                const isBusy = importing === it.id;
                return (
                  <li key={it.id} className="rounded-lg border bg-card p-3">
                    {it.thumbnail ? (
                      <img
                        src={it.thumbnail}
                        alt={it.title}
                        className="mb-2 aspect-video w-full rounded object-cover"
                      />
                    ) : (
                      <div className="mb-2 aspect-video w-full rounded bg-muted" />
                    )}
                    <h3 className="mb-2 truncate text-sm font-medium" title={it.title}>
                      {it.title || "Untitled"}
                    </h3>
                    <Button
                      size="sm"
                      variant={isImported ? "outline" : "default"}
                      className="w-full"
                      disabled={isBusy || isImported}
                      onClick={() => doImport(tab, it.id)}
                    >
                      {isBusy ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Importing…</>
                      ) : isImported ? (
                        <><Check className="h-3 w-3" /> Imported</>
                      ) : (
                        "Import"
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
            {cont && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  onClick={tab === "brand_template" ? loadMoreBrand : loadMoreDesigns}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </Tabs>
    </div>
  );
}
