-- 1. Schema: allow nesting products
alter table public.products
  add column if not exists parent_product_id uuid references public.products(id) on delete set null;

create index if not exists idx_products_parent on public.products(parent_product_id);

-- 2. Data: per workspace, create a "GlobalLink" parent product and re-parent existing subs.
do $$
declare
  ws record;
  tp_company uuid;
  gl_parent uuid;
  owner uuid;
begin
  for ws in select id, owner_id from public.workspaces loop
    owner := ws.owner_id;

    select id into tp_company
      from public.companies
      where workspace_id = ws.id and slug = 'transperfect'
      limit 1;
    if tp_company is null then continue; end if;

    -- skip if this workspace doesn't have the legacy GlobalLink Translation product
    if not exists (
      select 1 from public.products
      where company_id = tp_company and slug = 'globallink-translation'
    ) then
      continue;
    end if;

    -- create or fetch the GlobalLink parent product
    select id into gl_parent
      from public.products
      where company_id = tp_company and slug = 'globallink'
      limit 1;

    if gl_parent is null then
      insert into public.products (
        company_id, workspace_id, name, slug, description,
        primary_color, accent_color, created_by
      ) values (
        tp_company, ws.id, 'GlobalLink', 'globallink',
        'TransPerfect''s flagship globalization platform suite.',
        '#0E2C5C', '#F58220', owner
      )
      returning id into gl_parent;
    end if;

    -- re-parent existing GlobalLink subs
    update public.products
      set parent_product_id = gl_parent
      where company_id = tp_company
        and slug in ('globallink-translation', 'globallink-connect', 'globallink-now')
        and parent_product_id is distinct from gl_parent;

    -- add the new subs (Live, Web, Scribe) if missing
    insert into public.products (
      company_id, workspace_id, parent_product_id, name, slug, description,
      primary_color, accent_color, created_by
    )
    select tp_company, ws.id, gl_parent, v.name, v.slug, v.description,
           '#0E2C5C', v.accent, owner
    from (values
      ('GlobalLink Live',   'globallink-live',   'Live multilingual experiences and on-demand interpretation.', '#22D3EE'),
      ('GlobalLink Web',    'globallink-web',    'Website localization and proxy translation.',                  '#A78BFA'),
      ('GlobalLink Scribe', 'globallink-scribe', 'AI-assisted authoring and content creation.',                 '#F472B6')
    ) as v(name, slug, description, accent)
    where not exists (
      select 1 from public.products p2
      where p2.company_id = tp_company and p2.slug = v.slug
    );
  end loop;
end $$;
