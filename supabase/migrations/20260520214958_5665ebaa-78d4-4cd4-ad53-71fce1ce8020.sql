create table if not exists public.product_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  kind text not null default 'image',
  name text not null,
  url text not null,
  source text not null default 'upload' check (source in ('upload','ai')),
  prompt text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_assets_workspace on public.product_assets(workspace_id);
create index if not exists idx_product_assets_company on public.product_assets(company_id);
create index if not exists idx_product_assets_product on public.product_assets(product_id);

alter table public.product_assets enable row level security;

create policy "members view product assets"
  on public.product_assets for select to authenticated
  using (public.is_workspace_member(auth.uid(), workspace_id));

create policy "members insert product assets"
  on public.product_assets for insert to authenticated
  with check (public.is_workspace_member(auth.uid(), workspace_id) and created_by = auth.uid());

create policy "members delete product assets"
  on public.product_assets for delete to authenticated
  using (public.is_workspace_member(auth.uid(), workspace_id));
