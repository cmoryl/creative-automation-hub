INSERT INTO public.templates (workspace_id, engine, name, source_ref, preview_url, variables)
SELECT
  w.id,
  'illustrator',
  '[Live] Life Sciences Case Study – A4',
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
  ]'::jsonb
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.templates t
  WHERE t.workspace_id = w.id AND t.name = '[Live] Life Sciences Case Study – A4'
);

CREATE OR REPLACE FUNCTION public.seed_workspace_examples(_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
  project_id uuid;
  tpl_figma uuid;
  tpl_ai uuid;
  tpl_id uuid;
  tpl_canva uuid;
  tpl_life_sci uuid;
  job_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.templates
    WHERE workspace_id = _workspace_id AND name LIKE '[Example]%'
  ) THEN
    RETURN;
  END IF;

  SELECT w.owner_id INTO owner_id FROM public.workspaces w WHERE w.id = _workspace_id;
  IF owner_id IS NULL THEN RETURN; END IF;

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
$$;