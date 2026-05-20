
-- ============= COMPANIES =============
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  logo_url text,
  primary_color text,
  accent_color text,
  font_family text,
  contact_email text,
  contact_url text,
  brand_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies members rw"
  ON public.companies
  FOR ALL
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER companies_touch_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_companies_workspace ON public.companies(workspace_id);

-- ============= PRODUCTS =============
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  logo_url text,
  primary_color text,
  accent_color text,
  font_family text,
  contact_email text,
  contact_url text,
  brand_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug)
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products members rw"
  ON public.products
  FOR ALL
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER products_touch_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_products_company ON public.products(company_id);
CREATE INDEX idx_products_workspace ON public.products(workspace_id);

-- ============= TEMPLATES & PROJECTS: add company/product links =============
ALTER TABLE public.templates
  ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX idx_templates_company ON public.templates(company_id);
CREATE INDEX idx_templates_product ON public.templates(product_id);

ALTER TABLE public.projects
  ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX idx_projects_company ON public.projects(company_id);
CREATE INDEX idx_projects_product ON public.projects(product_id);

-- ============= SEED: TransPerfect + GlobalLink products for every workspace =============
DO $$
DECLARE
  ws RECORD;
  tp_company_id uuid;
BEGIN
  FOR ws IN SELECT id, owner_id FROM public.workspaces LOOP
    -- Insert TransPerfect company if not present
    SELECT id INTO tp_company_id
      FROM public.companies
      WHERE workspace_id = ws.id AND slug = 'transperfect';

    IF tp_company_id IS NULL THEN
      INSERT INTO public.companies (
        workspace_id, name, slug, description,
        primary_color, accent_color, font_family,
        contact_email, contact_url, created_by
      ) VALUES (
        ws.id, 'TransPerfect', 'transperfect',
        'Global content, technology and language solutions.',
        '#0E2C5C', '#F58220', 'Inter, system-ui, sans-serif',
        'travel360@transperfect.com', 'www.transperfect.com', ws.owner_id
      )
      RETURNING id INTO tp_company_id;

      -- Seed GlobalLink product family
      INSERT INTO public.products (company_id, workspace_id, name, slug, description, primary_color, accent_color, created_by)
      VALUES
        (tp_company_id, ws.id, 'GlobalLink Translation', 'globallink-translation',
         'Enterprise translation management on the GlobalLink platform.',
         '#0E2C5C', '#F58220', ws.owner_id),
        (tp_company_id, ws.id, 'GlobalLink Connect', 'globallink-connect',
         'Connectors that automate content flow between systems and GlobalLink.',
         '#0E2C5C', '#1FB6FF', ws.owner_id),
        (tp_company_id, ws.id, 'GlobalLink NOW', 'globallink-now',
         'Real-time AI-powered translation for live communications.',
         '#0E2C5C', '#34D399', ws.owner_id);
    END IF;

    -- Attach the existing TransPerfect Case Study template to the company (general, no product)
    UPDATE public.templates
      SET company_id = tp_company_id
      WHERE workspace_id = ws.id
        AND name = '[Live] TransPerfect Case Study – A4'
        AND company_id IS NULL;
  END LOOP;
END $$;

-- ============= Keep future workspace seeds creating TransPerfect too =============
CREATE OR REPLACE FUNCTION public.seed_workspace_examples(_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  owner_id uuid;
  project_id uuid;
  tpl_figma uuid;
  tpl_ai uuid;
  tpl_id uuid;
  tpl_canva uuid;
  tpl_life_sci uuid;
  tpl_tp_case uuid;
  job_id uuid;
  tp_company_id uuid;
BEGIN
  SELECT w.owner_id INTO owner_id FROM public.workspaces w WHERE w.id = _workspace_id;
  IF owner_id IS NULL THEN RETURN; END IF;

  -- Ensure TransPerfect company exists for this workspace
  SELECT id INTO tp_company_id
    FROM public.companies
    WHERE workspace_id = _workspace_id AND slug = 'transperfect';

  IF tp_company_id IS NULL THEN
    INSERT INTO public.companies (
      workspace_id, name, slug, description,
      primary_color, accent_color, font_family,
      contact_email, contact_url, created_by
    ) VALUES (
      _workspace_id, 'TransPerfect', 'transperfect',
      'Global content, technology and language solutions.',
      '#0E2C5C', '#F58220', 'Inter, system-ui, sans-serif',
      'travel360@transperfect.com', 'www.transperfect.com', owner_id
    )
    RETURNING id INTO tp_company_id;

    INSERT INTO public.products (company_id, workspace_id, name, slug, description, primary_color, accent_color, created_by) VALUES
      (tp_company_id, _workspace_id, 'GlobalLink Translation', 'globallink-translation',
       'Enterprise translation management on the GlobalLink platform.',
       '#0E2C5C', '#F58220', owner_id),
      (tp_company_id, _workspace_id, 'GlobalLink Connect', 'globallink-connect',
       'Connectors that automate content flow between systems and GlobalLink.',
       '#0E2C5C', '#1FB6FF', owner_id),
      (tp_company_id, _workspace_id, 'GlobalLink NOW', 'globallink-now',
       'Real-time AI-powered translation for live communications.',
       '#0E2C5C', '#34D399', owner_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.templates
    WHERE workspace_id = _workspace_id AND name LIKE '[Example]%'
  ) THEN
    -- Ensure TransPerfect template exists for already-seeded workspaces
    IF NOT EXISTS (
      SELECT 1 FROM public.templates
      WHERE workspace_id = _workspace_id AND name = '[Live] TransPerfect Case Study – A4'
    ) THEN
      INSERT INTO public.templates (workspace_id, company_id, engine, name, source_ref, preview_url, variables) VALUES
        (_workspace_id, tp_company_id, 'illustrator', '[Live] TransPerfect Case Study – A4',
         'bridge://templates/TP_CaseStudy_MASTER_v001.ai',
         '/templates/transperfect-case-study-hero.jpg',
         '[
           {"name":"case_study_title","type":"text","label":"Case Study Title","placeholder":"Organic & Paid Campaign Management for Qantas"},
           {"name":"vertical","type":"text","label":"Vertical / Market","placeholder":"Campaign Management, Korea."},
           {"name":"hero_image","type":"image","label":"Hero Image (A4)"},
           {"name":"challenge","type":"text","label":"The Challenge","multiline":true},
           {"name":"solution_bullets","type":"text","label":"The Solution (one bullet per line)","multiline":true},
           {"name":"stat_1_value","type":"text","label":"Result 1 — Value","placeholder":"490%"},
           {"name":"stat_1_label","type":"text","label":"Result 1 — Label","placeholder":"increase in organic site traffic"},
           {"name":"stat_2_value","type":"text","label":"Result 2 — Value","placeholder":"37%"},
           {"name":"stat_2_label","type":"text","label":"Result 2 — Label","placeholder":"increase in time on site"},
           {"name":"stat_3_value","type":"text","label":"Result 3 — Value","placeholder":"18%"},
           {"name":"stat_3_label","type":"text","label":"Result 3 — Label","placeholder":"decrease in bounce rate"},
           {"name":"stat_4_value","type":"text","label":"Result 4 — Value","placeholder":"25%"},
           {"name":"stat_4_label","type":"text","label":"Result 4 — Label","placeholder":"conversion rate increase (2.7% > 3.4%)"},
           {"name":"contact_email","type":"text","label":"Contact Email","placeholder":"travel360@transperfect.com"},
           {"name":"contact_url","type":"text","label":"Contact URL","placeholder":"www.transperfect.com"},
           {"name":"primary_color","type":"color","label":"Primary Brand Colour","placeholder":"#0E2C5C"},
           {"name":"accent_color","type":"color","label":"Accent Colour","placeholder":"#F58220"}
         ]'::jsonb);
    END IF;
    RETURN;
  END IF;

  INSERT INTO public.templates (workspace_id, engine, name, source_ref, preview_url, variables) VALUES
    (_workspace_id, 'figma', '[Example] Social Square – Figma',
     'https://www.figma.com/file/EXAMPLE/social-square',
     'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600&h=600&fit=crop',
     '[{"name":"headline","type":"text"},{"name":"subhead","type":"text"},{"name":"cta","type":"text"},{"name":"bg_color","type":"color"}]'::jsonb)
    RETURNING id INTO tpl_figma;

  INSERT INTO public.templates (workspace_id, engine, name, source_ref, preview_url, variables) VALUES
    (_workspace_id, 'illustrator', '[Example] Poster A3 – Illustrator',
     'bridge://templates/poster-a3.ai',
     'https://images.unsplash.com/photo-1561070791-2526d30994b8?w=600&h=800&fit=crop',
     '[{"name":"title","type":"text"},{"name":"date","type":"text"},{"name":"venue","type":"text"},{"name":"accent","type":"color"}]'::jsonb)
    RETURNING id INTO tpl_ai;

  INSERT INTO public.templates (workspace_id, engine, name, source_ref, preview_url, variables) VALUES
    (_workspace_id, 'indesign', '[Example] 8-Page Brochure – InDesign',
     'bridge://templates/brochure-8pg.indd',
     'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&h=400&fit=crop',
     '[{"name":"brand","type":"text"},{"name":"chapter_titles","type":"list"},{"name":"hero_image","type":"image"}]'::jsonb)
    RETURNING id INTO tpl_id;

  INSERT INTO public.templates (workspace_id, engine, name, source_ref, preview_url, variables) VALUES
    (_workspace_id, 'canva', '[Example] Story 9:16 – Canva',
     'https://www.canva.com/design/EXAMPLE',
     'https://images.unsplash.com/photo-1635776062127-d379bfcba9f8?w=600&h=1067&fit=crop',
     '[{"name":"headline","type":"text"},{"name":"product_image","type":"image"},{"name":"cta","type":"text"}]'::jsonb)
    RETURNING id INTO tpl_canva;

  INSERT INTO public.templates (workspace_id, engine, name, source_ref, preview_url, variables) VALUES
    (_workspace_id, 'illustrator', '[Live] Life Sciences Case Study – A4',
     'bridge://templates/CASE_STUDY_LETTER_MASTER_v001.ai',
     '/templates/life-sciences-case-study-hero.jpg',
     '[
       {"name":"client_name","type":"text","label":"Client / Organisation"},
       {"name":"case_study_title","type":"text","label":"Case Study Title"},
       {"name":"subtitle","type":"text","label":"Subtitle / Tagline"},
       {"name":"hero_image","type":"image","label":"Hero Image (A4)"},
       {"name":"challenge","type":"text","label":"The Challenge"},
       {"name":"solution","type":"text","label":"The Solution"},
       {"name":"results","type":"text","label":"Results & Outcomes"},
       {"name":"stat_1_value","type":"text","label":"Key Stat 1 — Value"},
       {"name":"stat_1_label","type":"text","label":"Key Stat 1 — Label"},
       {"name":"stat_2_value","type":"text","label":"Key Stat 2 — Value"},
       {"name":"stat_2_label","type":"text","label":"Key Stat 2 — Label"},
       {"name":"quote","type":"text","label":"Customer Quote"},
       {"name":"quote_author","type":"text","label":"Quote Author"},
       {"name":"primary_color","type":"color","label":"Primary Brand Colour"},
       {"name":"accent_color","type":"color","label":"Accent Colour"},
       {"name":"logo","type":"image","label":"Client Logo"}
     ]'::jsonb)
    RETURNING id INTO tpl_life_sci;

  INSERT INTO public.templates (workspace_id, company_id, engine, name, source_ref, preview_url, variables) VALUES
    (_workspace_id, tp_company_id, 'illustrator', '[Live] TransPerfect Case Study – A4',
     'bridge://templates/TP_CaseStudy_MASTER_v001.ai',
     '/templates/transperfect-case-study-hero.jpg',
     '[
       {"name":"case_study_title","type":"text","label":"Case Study Title","placeholder":"Organic & Paid Campaign Management for Qantas"},
       {"name":"vertical","type":"text","label":"Vertical / Market","placeholder":"Campaign Management, Korea."},
       {"name":"hero_image","type":"image","label":"Hero Image (A4)"},
       {"name":"challenge","type":"text","label":"The Challenge","multiline":true},
       {"name":"solution_bullets","type":"text","label":"The Solution (one bullet per line)","multiline":true},
       {"name":"stat_1_value","type":"text","label":"Result 1 — Value","placeholder":"490%"},
       {"name":"stat_1_label","type":"text","label":"Result 1 — Label","placeholder":"increase in organic site traffic"},
       {"name":"stat_2_value","type":"text","label":"Result 2 — Value","placeholder":"37%"},
       {"name":"stat_2_label","type":"text","label":"Result 2 — Label","placeholder":"increase in time on site"},
       {"name":"stat_3_value","type":"text","label":"Result 3 — Value","placeholder":"18%"},
       {"name":"stat_3_label","type":"text","label":"Result 3 — Label","placeholder":"decrease in bounce rate"},
       {"name":"stat_4_value","type":"text","label":"Result 4 — Value","placeholder":"25%"},
       {"name":"stat_4_label","type":"text","label":"Result 4 — Label","placeholder":"conversion rate increase (2.7% > 3.4%)"},
       {"name":"contact_email","type":"text","label":"Contact Email","placeholder":"travel360@transperfect.com"},
       {"name":"contact_url","type":"text","label":"Contact URL","placeholder":"www.transperfect.com"},
       {"name":"primary_color","type":"color","label":"Primary Brand Colour","placeholder":"#0E2C5C"},
       {"name":"accent_color","type":"color","label":"Accent Colour","placeholder":"#F58220"}
     ]'::jsonb)
    RETURNING id INTO tpl_tp_case;

  INSERT INTO public.projects (workspace_id, created_by, name, status, brief) VALUES
    (_workspace_id, owner_id, '[Example] Summer Launch Campaign', 'active',
     E'Launch our summer collection across all channels.\n\n- Headline: "Made for sunlit days"\n- Subhead: "The 2026 Summer Edit is here."\n- CTA: "Shop the drop"\n- Tone: warm, optimistic, premium-casual\n- Channels: Instagram (square + story), A3 print poster, 8-page lookbook.\n- Colours: coral #FF6B5A, sand #F4E7D3, charcoal #1F1B1A')
    RETURNING id INTO project_id;

  INSERT INTO public.jobs (project_id, workspace_id, template_id, engine, status, brief, variables, completed_at)
  VALUES (project_id, _workspace_id, tpl_figma, 'figma', 'completed',
    '{"summary":"IG square hero"}'::jsonb,
    '{"headline":"Made for sunlit days","subhead":"2026 Summer Edit","cta":"Shop the drop","bg_color":"#FF6B5A"}'::jsonb,
    now() - interval '2 hours')
  RETURNING id INTO job_id;
  INSERT INTO public.outputs (job_id, kind, url, metadata) VALUES
    (job_id, 'png', 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=1080&h=1080&fit=crop', '{"width":1080,"height":1080,"channel":"instagram"}'::jsonb),
    (job_id, 'pdf', 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=1080&h=1080&fit=crop', '{"pages":1,"channel":"print"}'::jsonb);
END;
$function$;
