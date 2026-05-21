import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Package, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  listCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/lib/brand.functions";

export const Route = createFileRoute("/_authenticated/brands")({
  component: BrandsPage,
});

type Kit = {
  description?: string;
  logo_url?: string;
  primary_color?: string;
  accent_color?: string;
  font_family?: string;
  contact_email?: string;
  contact_url?: string;
};

function KitFields({
  value,
  onChange,
}: {
  value: Kit;
  onChange: (v: Kit) => void;
}) {
  const set = (k: keyof Kit, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className="text-xs font-medium">Description</label>
        <Textarea
          value={value.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
        />
      </div>
      <div className="col-span-2">
        <label className="text-xs font-medium">Logo URL</label>
        <Input value={value.logo_url ?? ""} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://…" />
      </div>
      <div>
        <label className="text-xs font-medium">Primary color</label>
        <Input value={value.primary_color ?? ""} onChange={(e) => set("primary_color", e.target.value)} placeholder="#0E2C5C" />
      </div>
      <div>
        <label className="text-xs font-medium">Accent color</label>
        <Input value={value.accent_color ?? ""} onChange={(e) => set("accent_color", e.target.value)} placeholder="#F58220" />
      </div>
      <div className="col-span-2">
        <label className="text-xs font-medium">Font family</label>
        <Input value={value.font_family ?? ""} onChange={(e) => set("font_family", e.target.value)} placeholder="Inter, sans-serif" />
      </div>
      <div>
        <label className="text-xs font-medium">Contact email</label>
        <Input value={value.contact_email ?? ""} onChange={(e) => set("contact_email", e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-medium">Website</label>
        <Input value={value.contact_url ?? ""} onChange={(e) => set("contact_url", e.target.value)} />
      </div>
    </div>
  );
}

function BrandsPage() {
  const fetchFn = useServerFn(listCompanies);
  const createCoFn = useServerFn(createCompany);
  const updateCoFn = useServerFn(updateCompany);
  const deleteCoFn = useServerFn(deleteCompany);
  const createPrFn = useServerFn(createProduct);
  const updatePrFn = useServerFn(updateProduct);
  const deletePrFn = useServerFn(deleteProduct);
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["companies"], queryFn: () => fetchFn() });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["companies"] });

  const [coOpen, setCoOpen] = useState(false);
  const [coName, setCoName] = useState("");
  const [coKit, setCoKit] = useState<Kit>({});

  const [editCo, setEditCo] = useState<{ id: string; name: string; kit: Kit } | null>(null);
  const [prFor, setPrFor] = useState<{ companyId: string; parentProductId: string | null; parentName?: string } | null>(null);
  const [prName, setPrName] = useState("");
  const [prKit, setPrKit] = useState<Kit>({});
  const [editPr, setEditPr] = useState<{ id: string; name: string; kit: Kit } | null>(null);

  const submitCo = async () => {
    if (!coName.trim()) return;
    try {
      await createCoFn({ data: { name: coName.trim(), kit: coKit } });
      toast.success("Company created");
      setCoOpen(false); setCoName(""); setCoKit({});
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const submitPr = async () => {
    if (!prFor || !prName.trim()) return;
    try {
      await createPrFn({ data: { companyId: prFor.companyId, parentProductId: prFor.parentProductId, name: prName.trim(), kit: prKit } });
      toast.success(prFor.parentProductId ? "Sub-product created" : "Product created");
      setPrFor(null); setPrName(""); setPrKit({});
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Brands</h1>
          <p className="text-sm text-muted-foreground">
            Companies and products. Brand kit (colors, logo, contact) auto-fills matching template fields on create.
          </p>
        </div>
        <Dialog open={coOpen} onOpenChange={setCoOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> New company</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>New company</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Company name" value={coName} onChange={(e) => setCoName(e.target.value)} />
              <KitFields value={coKit} onChange={setCoKit} />
              <Button onClick={submitCo} disabled={!coName.trim()} className="w-full">Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No companies yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    to="/templates"
                    search={{ company: c.id }}
                    className="flex items-center gap-3 rounded-md -m-1 p-1 hover:bg-muted/50 transition-colors"
                  >
                    {c.logo_url ? (
                      <img src={c.logo_url} alt="" className="h-10 w-10 rounded object-contain bg-muted" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <h2 className="font-semibold hover:underline">{c.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {c.templateCount} template{c.templateCount === 1 ? "" : "s"} · {c.products.length} product{c.products.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex gap-1 ml-2">
                      {c.primary_color && <span className="h-5 w-5 rounded border" style={{ background: c.primary_color }} title={c.primary_color} />}
                      {c.accent_color && <span className="h-5 w-5 rounded border" style={{ background: c.accent_color }} title={c.accent_color} />}
                    </div>
                  </Link>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditCo({ id: c.id, name: c.name, kit: {
                      description: c.description ?? "", logo_url: c.logo_url ?? "",
                      primary_color: c.primary_color ?? "", accent_color: c.accent_color ?? "",
                      font_family: c.font_family ?? "", contact_email: c.contact_email ?? "", contact_url: c.contact_url ?? "",
                    } })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive"
                      onClick={async () => {
                        if (!confirm(`Delete ${c.name}? Products and template links are detached.`)) return;
                        await deleteCoFn({ data: { id: c.id } });
                        toast.success("Deleted");
                        invalidate();
                      }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 space-y-3 pl-13">
                  {c.products.map((p) => (
                    <div key={p.id} className="rounded border bg-muted/30">
                      <div className="flex items-center justify-between px-3 py-2">
                        <Link
                          to="/templates"
                          search={{ product: p.id }}
                          className="flex items-center gap-2 text-sm flex-1 hover:underline"
                        >
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{p.name}</span>
                          <span className="text-xs text-muted-foreground">
                            · {p.templateCount} template{p.templateCount === 1 ? "" : "s"}
                            {p.subProducts.length > 0 && ` · ${p.subProducts.length} sub-product${p.subProducts.length === 1 ? "" : "s"}`}
                          </span>
                          {p.primary_color && <span className="h-3 w-3 rounded-full border" style={{ background: p.primary_color }} />}
                        </Link>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => { setPrFor({ companyId: c.id, parentProductId: p.id, parentName: p.name }); setPrName(""); setPrKit({}); }}>
                            <Plus className="h-3.5 w-3.5" /> Sub-product
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditPr({ id: p.id, name: p.name, kit: {
                            description: p.description ?? "", logo_url: p.logo_url ?? "",
                            primary_color: p.primary_color ?? "", accent_color: p.accent_color ?? "",
                            font_family: p.font_family ?? "", contact_email: p.contact_email ?? "", contact_url: p.contact_url ?? "",
                          } })}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                            onClick={async () => {
                              if (!confirm(`Delete product ${p.name}? Sub-products will be detached.`)) return;
                              await deletePrFn({ data: { id: p.id } });
                              toast.success("Deleted");
                              invalidate();
                            }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      {p.subProducts.length > 0 && (
                        <div className="space-y-1 border-t bg-background/40 p-2 pl-8">
                          {p.subProducts.map((sp) => (
                            <div key={sp.id} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted/50">
                              <Link
                                to="/templates"
                                search={{ product: sp.id }}
                                className="flex items-center gap-2 flex-1 hover:underline"
                              >
                                <span className="text-muted-foreground">↳</span>
                                <span>{sp.name}</span>
                                <span className="text-xs text-muted-foreground">· {sp.templateCount} template{sp.templateCount === 1 ? "" : "s"}</span>
                                {sp.primary_color && <span className="h-2.5 w-2.5 rounded-full border" style={{ background: sp.primary_color }} />}
                              </Link>
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditPr({ id: sp.id, name: sp.name, kit: {
                                  description: sp.description ?? "", logo_url: sp.logo_url ?? "",
                                  primary_color: sp.primary_color ?? "", accent_color: sp.accent_color ?? "",
                                  font_family: sp.font_family ?? "", contact_email: sp.contact_email ?? "", contact_url: sp.contact_url ?? "",
                                } })}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                                  onClick={async () => {
                                    if (!confirm(`Delete sub-product ${sp.name}?`)) return;
                                    await deletePrFn({ data: { id: sp.id } });
                                    toast.success("Deleted");
                                    invalidate();
                                  }}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => { setPrFor({ companyId: c.id, parentProductId: null }); setPrName(""); setPrKit({}); }}>
                    <Plus className="h-3.5 w-3.5" /> Add product
                  </Button>
                </div>

                {c.templates.length > 0 && (
                  <div className="mt-4 space-y-1 rounded border bg-muted/20 p-2">
                    <div className="px-1 text-xs font-medium text-muted-foreground">
                      Brand templates ({c.templates.length})
                    </div>
                    {c.templates.map((t) => (
                      <Link
                        key={t.id}
                        to="/templates/$templateId"
                        params={{ templateId: t.id }}
                        className="flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-background"
                      >
                        <span className="truncate">{t.name}</span>
                        <span className="text-xs text-muted-foreground uppercase">{t.engine}</span>
                      </Link>
                    ))}
                  </div>
                )}

                <div className="mt-3 text-xs text-muted-foreground">
                  <Link to="/templates" className="hover:underline">View all templates →</Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit company */}
      <Dialog open={!!editCo} onOpenChange={(o) => !o && setEditCo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit company</DialogTitle></DialogHeader>
          {editCo && (
            <div className="space-y-3">
              <Input value={editCo.name} onChange={(e) => setEditCo({ ...editCo, name: e.target.value })} />
              <KitFields value={editCo.kit} onChange={(kit) => setEditCo({ ...editCo, kit })} />
              <Button className="w-full" onClick={async () => {
                await updateCoFn({ data: { id: editCo.id, name: editCo.name, kit: editCo.kit } });
                toast.success("Saved");
                setEditCo(null); invalidate();
              }}>Save</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New product */}
      <Dialog open={!!prFor} onOpenChange={(o) => !o && setPrFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{prFor?.parentProductId ? `New sub-product under ${prFor.parentName ?? "product"}` : "New product"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder={prFor?.parentProductId ? "Sub-product name (e.g. GlobalLink Connect)" : "Product name"} value={prName} onChange={(e) => setPrName(e.target.value)} />
            <KitFields value={prKit} onChange={setPrKit} />
            <p className="text-xs text-muted-foreground">Leave fields blank to inherit from the {prFor?.parentProductId ? "parent product, then the company" : "company"}.</p>
            <Button onClick={submitPr} disabled={!prName.trim()} className="w-full">Create</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit product */}
      <Dialog open={!!editPr} onOpenChange={(o) => !o && setEditPr(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit product</DialogTitle></DialogHeader>
          {editPr && (
            <div className="space-y-3">
              <Input value={editPr.name} onChange={(e) => setEditPr({ ...editPr, name: e.target.value })} />
              <KitFields value={editPr.kit} onChange={(kit) => setEditPr({ ...editPr, kit })} />
              <Button className="w-full" onClick={async () => {
                await updatePrFn({ data: { id: editPr.id, name: editPr.name, kit: editPr.kit } });
                toast.success("Saved");
                setEditPr(null); invalidate();
              }}>Save</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
