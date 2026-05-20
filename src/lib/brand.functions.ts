import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";

const brandKitInput = z.object({
  description: z.string().max(2000).nullish(),
  logo_url: z.string().url().max(500).nullish().or(z.literal("")),
  primary_color: z.string().max(20).nullish().or(z.literal("")),
  accent_color: z.string().max(20).nullish().or(z.literal("")),
  font_family: z.string().max(120).nullish().or(z.literal("")),
  contact_email: z.string().max(200).nullish().or(z.literal("")),
  contact_url: z.string().max(300).nullish().or(z.literal("")),
});

// ---------------- COMPANIES ----------------
export const listCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [cRes, pRes, tRes] = await Promise.all([
      supabase
        .from("companies")
        .select(
          "id, name, slug, description, logo_url, primary_color, accent_color, font_family, contact_email, contact_url, brand_metadata, workspace_id, created_at",
        )
        .order("name"),
      supabase
        .from("products")
        .select(
          "id, company_id, parent_product_id, name, slug, description, logo_url, primary_color, accent_color, font_family, contact_email, contact_url, brand_metadata, created_at",
        )
        .order("name"),
      supabase.from("templates").select("id, name, engine, preview_url, company_id, product_id").order("name"),
    ]);
    if (cRes.error) throw cRes.error;
    if (pRes.error) throw pRes.error;
    if (tRes.error) throw tRes.error;

    const products = pRes.data ?? [];
    const templates = tRes.data ?? [];
    const decorate = (p: (typeof products)[number]) => ({
      ...p,
      templateCount: templates.filter((t) => t.product_id === p.id).length,
      templates: templates.filter((t) => t.product_id === p.id),
      subProducts: products
        .filter((sp) => sp.parent_product_id === p.id)
        .map((sp) => ({
          ...sp,
          templateCount: templates.filter((t) => t.product_id === sp.id).length,
          templates: templates.filter((t) => t.product_id === sp.id),
        })),
    });
    return (cRes.data ?? []).map((c) => ({
      ...c,
      products: products
        .filter((p) => p.company_id === c.id && !p.parent_product_id)
        .map(decorate),
      templateCount: templates.filter((t) => t.company_id === c.id).length,
      templates: templates.filter((t) => t.company_id === c.id && !t.product_id),
    }));
  });

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().min(1).max(120),
        kit: brandKitInput.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();
    if (wsErr) throw wsErr;
    if (!ws) throw new Error("No workspace found");
    const slug = slugify(data.name);
    const { data: row, error } = await supabase
      .from("companies")
      .insert({
        workspace_id: ws.id,
        created_by: userId,
        name: data.name,
        slug,
        description: data.kit?.description ?? null,
        logo_url: data.kit?.logo_url || null,
        primary_color: data.kit?.primary_color || null,
        accent_color: data.kit?.accent_color || null,
        font_family: data.kit?.font_family || null,
        contact_email: data.kit?.contact_email || null,
        contact_url: data.kit?.contact_url || null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const updateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        kit: brandKitInput.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      name?: string;
      description?: string | null;
      logo_url?: string | null;
      primary_color?: string | null;
      accent_color?: string | null;
      font_family?: string | null;
      contact_email?: string | null;
      contact_url?: string | null;
    } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.kit) {
      if (data.kit.description !== undefined) patch.description = data.kit.description || null;
      if (data.kit.logo_url !== undefined) patch.logo_url = data.kit.logo_url || null;
      if (data.kit.primary_color !== undefined) patch.primary_color = data.kit.primary_color || null;
      if (data.kit.accent_color !== undefined) patch.accent_color = data.kit.accent_color || null;
      if (data.kit.font_family !== undefined) patch.font_family = data.kit.font_family || null;
      if (data.kit.contact_email !== undefined) patch.contact_email = data.kit.contact_email || null;
      if (data.kit.contact_url !== undefined) patch.contact_url = data.kit.contact_url || null;
    }
    const { error } = await context.supabase.from("companies").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("companies").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------------- PRODUCTS ----------------
export const createProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        companyId: z.string().uuid(),
        name: z.string().min(1).max(120),
        parentProductId: z.string().uuid().nullish(),
        kit: brandKitInput.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: company, error: cErr } = await supabase
      .from("companies")
      .select("id, workspace_id")
      .eq("id", data.companyId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!company) throw new Error("Company not found");
    const slug = slugify(data.name);
    const { data: row, error } = await supabase
      .from("products")
      .insert({
        company_id: company.id,
        workspace_id: company.workspace_id,
        parent_product_id: data.parentProductId ?? null,
        created_by: userId,
        name: data.name,
        slug,
        description: data.kit?.description ?? null,
        logo_url: data.kit?.logo_url || null,
        primary_color: data.kit?.primary_color || null,
        accent_color: data.kit?.accent_color || null,
        font_family: data.kit?.font_family || null,
        contact_email: data.kit?.contact_email || null,
        contact_url: data.kit?.contact_url || null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const updateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        kit: brandKitInput.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      name?: string;
      description?: string | null;
      logo_url?: string | null;
      primary_color?: string | null;
      accent_color?: string | null;
      font_family?: string | null;
      contact_email?: string | null;
      contact_url?: string | null;
    } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.kit) {
      if (data.kit.description !== undefined) patch.description = data.kit.description || null;
      if (data.kit.logo_url !== undefined) patch.logo_url = data.kit.logo_url || null;
      if (data.kit.primary_color !== undefined) patch.primary_color = data.kit.primary_color || null;
      if (data.kit.accent_color !== undefined) patch.accent_color = data.kit.accent_color || null;
      if (data.kit.font_family !== undefined) patch.font_family = data.kit.font_family || null;
      if (data.kit.contact_email !== undefined) patch.contact_email = data.kit.contact_email || null;
      if (data.kit.contact_url !== undefined) patch.contact_url = data.kit.contact_url || null;
    }
    const { error } = await context.supabase.from("products").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("products").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------------- ASSIGN TEMPLATE ----------------
export const assignTemplateBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        templateId: z.string().uuid(),
        companyId: z.string().uuid().nullable(),
        productId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("templates")
      .update({ company_id: data.companyId, product_id: data.productId })
      .eq("id", data.templateId);
    if (error) throw error;
    return { ok: true };
  });

// ---------------- BRAND KIT PREFILL ----------------
// Returns a Record<string,string> mapping template variable names to brand-kit
// values. Product overrides company. Used to auto-fill the variations form.
export const getTemplateBrandPrefill = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ templateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tpl, error: tErr } = await supabase
      .from("templates")
      .select("id, company_id, product_id")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!tpl) return { prefill: {}, source: null };

    type Kit = {
      name: string;
      logo_url: string | null;
      primary_color: string | null;
      accent_color: string | null;
      font_family: string | null;
      contact_email: string | null;
      contact_url: string | null;
    };
    let company: Kit | null = null;
    let product: Kit | null = null;

    if (tpl.company_id) {
      const { data: c } = await supabase
        .from("companies")
        .select("name, logo_url, primary_color, accent_color, font_family, contact_email, contact_url")
        .eq("id", tpl.company_id)
        .maybeSingle();
      company = (c as Kit | null) ?? null;
    }
    if (tpl.product_id) {
      const { data: p } = await supabase
        .from("products")
        .select("name, logo_url, primary_color, accent_color, font_family, contact_email, contact_url, parent_product_id")
        .eq("id", tpl.product_id)
        .maybeSingle();
      product = (p as (Kit & { parent_product_id?: string | null }) | null) ?? null;
      // Walk up to parent product if present
      const parentId = (p as { parent_product_id?: string | null } | null)?.parent_product_id;
      if (parentId) {
        const { data: pp } = await supabase
          .from("products")
          .select("name, logo_url, primary_color, accent_color, font_family, contact_email, contact_url")
          .eq("id", parentId)
          .maybeSingle();
        if (pp) {
          // merge: child overrides parent
          product = {
            name: product?.name ?? (pp as Kit).name,
            logo_url: product?.logo_url || (pp as Kit).logo_url,
            primary_color: product?.primary_color || (pp as Kit).primary_color,
            accent_color: product?.accent_color || (pp as Kit).accent_color,
            font_family: product?.font_family || (pp as Kit).font_family,
            contact_email: product?.contact_email || (pp as Kit).contact_email,
            contact_url: product?.contact_url || (pp as Kit).contact_url,
          };
        }
      }
    }

    const pick = (key: keyof Kit): string | null =>
      (product?.[key] as string | null) || (company?.[key] as string | null) || null;

    const map: Record<string, string | null> = {
      logo: pick("logo_url"),
      logo_url: pick("logo_url"),
      primary_color: pick("primary_color"),
      brand_color: pick("primary_color"),
      accent_color: pick("accent_color"),
      accent: pick("accent_color"),
      font_family: pick("font_family"),
      contact_email: pick("contact_email"),
      email: pick("contact_email"),
      contact_url: pick("contact_url"),
      website: pick("contact_url"),
      client_name: product?.name ?? company?.name ?? null,
      brand: company?.name ?? null,
    };

    const prefill: Record<string, string> = {};
    for (const [k, v] of Object.entries(map)) if (v) prefill[k] = v;

    return {
      prefill,
      source: {
        companyId: tpl.company_id,
        companyName: company?.name ?? null,
        productId: tpl.product_id,
        productName: product?.name ?? null,
      },
    };
  });
