
CREATE OR REPLACE FUNCTION public.seed_workspace_examples(_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  owner_id uuid;
  project_id uuid;
  tp_company_id uuid;
  job_id uuid;
  tpl_figma uuid;
BEGIN
  SELECT w.owner_id INTO owner_id FROM public.workspaces w WHERE w.id = _workspace_id;
  IF owner_id IS NULL THEN RETURN; END IF;

  -- Ensure TransPerfect company + products exist
  SELECT id INTO tp_company_id FROM public.companies
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
    ) RETURNING id INTO tp_company_id;

    INSERT INTO public.products (company_id, workspace_id, name, slug, description, primary_color, accent_color, created_by) VALUES
      (tp_company_id, _workspace_id, 'GlobalLink Translation', 'globallink-translation', 'Enterprise translation management on the GlobalLink platform.', '#0E2C5C', '#F58220', owner_id),
      (tp_company_id, _workspace_id, 'GlobalLink Connect', 'globallink-connect', 'Connectors that automate content flow between systems and GlobalLink.', '#0E2C5C', '#1FB6FF', owner_id),
      (tp_company_id, _workspace_id, 'GlobalLink NOW', 'globallink-now', 'Real-time AI-powered translation for live communications.', '#0E2C5C', '#34D399', owner_id);
  END IF;

  -- Bail out (after company guarantee) if templates were already seeded.
  IF EXISTS (SELECT 1 FROM public.templates
    WHERE workspace_id = _workspace_id AND name LIKE '[Example]%') THEN
    RETURN;
  END IF;

  -- Core single-page examples (one per engine).
  INSERT INTO public.templates (workspace_id, engine, name, source_ref, preview_url, variables)
  VALUES
    (_workspace_id, 'figma', '[Example] Social Square – Figma',
     'https://www.figma.com/file/EXAMPLE/social-square',
     'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600&h=600&fit=crop',
     '[{"name":"headline","type":"text"},{"name":"subhead","type":"text"},{"name":"cta","type":"text"},{"name":"bg_color","type":"color"}]'::jsonb)
  RETURNING id INTO tpl_figma;

  INSERT INTO public.templates (workspace_id, engine, name, source_ref, preview_url, variables)
  VALUES
    (_workspace_id, 'illustrator', '[Example] Poster A3 – Illustrator',
     'bridge://templates/poster-a3.ai',
     'https://images.unsplash.com/photo-1561070791-2526d30994b8?w=600&h=800&fit=crop',
     '[{"name":"title","type":"text"},{"name":"date","type":"text"},{"name":"venue","type":"text"},{"name":"accent","type":"color"}]'::jsonb),
    (_workspace_id, 'indesign', '[Example] 8-Page Brochure – InDesign',
     'bridge://templates/brochure-8pg.indd',
     'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&h=400&fit=crop',
     '[{"name":"brand","type":"text"},{"name":"chapter_titles","type":"list"},{"name":"hero_image","type":"image"}]'::jsonb),
    (_workspace_id, 'canva', '[Example] Story 9:16 – Canva',
     'https://www.canva.com/design/EXAMPLE',
     'https://images.unsplash.com/photo-1635776062127-d379bfcba9f8?w=600&h=1067&fit=crop',
     '[{"name":"headline","type":"text"},{"name":"product_image","type":"image"},{"name":"cta","type":"text"}]'::jsonb);

  -- Multi-page Illustrator + InDesign examples.
  INSERT INTO public.templates (workspace_id, engine, name, source_ref, preview_url, variables, pages) VALUES
    (_workspace_id, 'illustrator', '[Example] Business Card – Front & Back',
     'bridge://templates/business-card-2up.ai',
     'https://images.unsplash.com/photo-1606857521015-7f9fcf423740?w=800&h=500&fit=crop',
     '[{"name":"full_name","type":"text","label":"Full Name"},{"name":"job_title","type":"text","label":"Job Title"},{"name":"email","type":"text","label":"Email"},{"name":"phone","type":"text","label":"Phone"},{"name":"website","type":"text","label":"Website"},{"name":"primary_color","type":"color","label":"Brand Colour"},{"name":"logo","type":"image","label":"Logo"}]'::jsonb,
     '[{"name":"Front","width":3.5,"height":2,"unit":"in","kind":"artboard","artboard_index":0},{"name":"Back","width":3.5,"height":2,"unit":"in","kind":"artboard","artboard_index":1}]'::jsonb),
    (_workspace_id, 'illustrator', '[Example] Tri-Fold Brochure – A4',
     'bridge://templates/trifold-a4.ai',
     'https://images.unsplash.com/photo-1586717791821-3f44a563fa4c?w=800&h=600&fit=crop',
     '[{"name":"brand_name","type":"text","label":"Brand"},{"name":"headline","type":"text","label":"Cover Headline"},{"name":"intro","type":"text","label":"Intro Copy","multiline":true},{"name":"panel_1","type":"text","label":"Panel 1 Body","multiline":true},{"name":"panel_2","type":"text","label":"Panel 2 Body","multiline":true},{"name":"panel_3","type":"text","label":"Panel 3 Body","multiline":true},{"name":"cta","type":"text","label":"Call to Action"},{"name":"primary_color","type":"color","label":"Brand Colour"},{"name":"hero_image","type":"image","label":"Hero Image"}]'::jsonb,
     '[{"name":"Outside Spread","width":297,"height":210,"unit":"mm","kind":"artboard","artboard_index":0},{"name":"Inside Spread","width":297,"height":210,"unit":"mm","kind":"artboard","artboard_index":1}]'::jsonb),
    (_workspace_id, 'illustrator', '[Example] Event Flyer – A4',
     'bridge://templates/event-flyer-a4.ai',
     'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&h=850&fit=crop',
     '[{"name":"event_title","type":"text","label":"Event Title"},{"name":"date","type":"text","label":"Date"},{"name":"venue","type":"text","label":"Venue"},{"name":"description","type":"text","label":"Description","multiline":true},{"name":"cta_url","type":"text","label":"Tickets URL"},{"name":"accent_color","type":"color","label":"Accent"},{"name":"hero_image","type":"image","label":"Hero Image"}]'::jsonb,
     '[{"name":"A4","width":210,"height":297,"unit":"mm","kind":"artboard","artboard_index":0}]'::jsonb),
    (_workspace_id, 'indesign', '[Example] 4-Page Newsletter – A4',
     'bridge://templates/newsletter-4pg.indd',
     'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&h=600&fit=crop',
     '[{"name":"masthead","type":"text"},{"name":"issue","type":"text"},{"name":"lead_headline","type":"text"},{"name":"lead_body","type":"text","multiline":true},{"name":"story_2_title","type":"text"},{"name":"story_2_body","type":"text","multiline":true},{"name":"story_3_title","type":"text"},{"name":"story_3_body","type":"text","multiline":true},{"name":"sidebar","type":"text","multiline":true},{"name":"closing_note","type":"text","multiline":true},{"name":"primary_color","type":"color"},{"name":"cover_image","type":"image"}]'::jsonb,
     '[{"name":"Cover","width":210,"height":297,"unit":"mm","kind":"page","page_index":1},{"name":"Page 2","width":210,"height":297,"unit":"mm","kind":"page","page_index":2},{"name":"Page 3","width":210,"height":297,"unit":"mm","kind":"page","page_index":3},{"name":"Back Cover","width":210,"height":297,"unit":"mm","kind":"page","page_index":4}]'::jsonb),
    (_workspace_id, 'indesign', '[Example] 12-Page Magazine – A4',
     'bridge://templates/magazine-12pg.indd',
     'https://images.unsplash.com/photo-1532153975070-2e9ab71f1b14?w=800&h=600&fit=crop',
     '[{"name":"magazine_title","type":"text"},{"name":"issue","type":"text"},{"name":"cover_headline","type":"text"},{"name":"cover_image","type":"image"},{"name":"feature_1_title","type":"text"},{"name":"feature_1_body","type":"text","multiline":true},{"name":"feature_2_title","type":"text"},{"name":"feature_2_body","type":"text","multiline":true},{"name":"feature_3_title","type":"text"},{"name":"feature_3_body","type":"text","multiline":true},{"name":"interview_title","type":"text"},{"name":"interview_body","type":"text","multiline":true},{"name":"primary_color","type":"color"},{"name":"accent_color","type":"color"}]'::jsonb,
     (SELECT jsonb_agg(jsonb_build_object('name','Page '||g,'width',210,'height',297,'unit','mm','kind','page','page_index',g)) FROM generate_series(1,12) g)),
    (_workspace_id, 'indesign', '[Example] Pitch Deck – 16:9 (10 slides)',
     'bridge://templates/pitch-deck-16x9.indd',
     'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&h=450&fit=crop',
     '[{"name":"company","type":"text"},{"name":"tagline","type":"text"},{"name":"problem","type":"text","multiline":true},{"name":"solution","type":"text","multiline":true},{"name":"market","type":"text","multiline":true},{"name":"product","type":"text","multiline":true},{"name":"traction","type":"text","multiline":true},{"name":"business_model","type":"text","multiline":true},{"name":"team","type":"text","multiline":true},{"name":"ask","type":"text","multiline":true},{"name":"primary_color","type":"color"},{"name":"logo","type":"image"}]'::jsonb,
     (SELECT jsonb_agg(jsonb_build_object('name','Slide '||g,'width',1920,'height',1080,'unit','px','kind','page','page_index',g)) FROM generate_series(1,10) g));

  -- Live TransPerfect + Life Sciences case study templates.
  INSERT INTO public.templates (workspace_id, engine, name, source_ref, preview_url, variables) VALUES
    (_workspace_id, 'illustrator', '[Live] Life Sciences Case Study – A4',
     'bridge://templates/CASE_STUDY_LETTER_MASTER_v001.ai',
     '/templates/life-sciences-case-study-hero.jpg',
     '[{"name":"client_name","type":"text","label":"Client / Organisation"},{"name":"case_study_title","type":"text","label":"Case Study Title"},{"name":"subtitle","type":"text","label":"Subtitle / Tagline"},{"name":"hero_image","type":"image","label":"Hero Image (A4)"},{"name":"challenge","type":"text","label":"The Challenge"},{"name":"solution","type":"text","label":"The Solution"},{"name":"results","type":"text","label":"Results & Outcomes"},{"name":"stat_1_value","type":"text"},{"name":"stat_1_label","type":"text"},{"name":"stat_2_value","type":"text"},{"name":"stat_2_label","type":"text"},{"name":"quote","type":"text"},{"name":"quote_author","type":"text"},{"name":"primary_color","type":"color"},{"name":"accent_color","type":"color"},{"name":"logo","type":"image"}]'::jsonb);

  INSERT INTO public.templates (workspace_id, company_id, engine, name, source_ref, preview_url, variables) VALUES
    (_workspace_id, tp_company_id, 'illustrator', '[Live] TransPerfect Case Study – A4',
     'bridge://templates/TP_CaseStudy_MASTER_v001.ai',
     '/templates/transperfect-case-study-hero.jpg',
     '[{"name":"case_study_title","type":"text","placeholder":"Organic & Paid Campaign Management for Qantas"},{"name":"vertical","type":"text"},{"name":"hero_image","type":"image"},{"name":"challenge","type":"text","multiline":true},{"name":"solution_bullets","type":"text","multiline":true},{"name":"stat_1_value","type":"text"},{"name":"stat_1_label","type":"text"},{"name":"stat_2_value","type":"text"},{"name":"stat_2_label","type":"text"},{"name":"stat_3_value","type":"text"},{"name":"stat_3_label","type":"text"},{"name":"stat_4_value","type":"text"},{"name":"stat_4_label","type":"text"},{"name":"contact_email","type":"text"},{"name":"contact_url","type":"text"},{"name":"primary_color","type":"color"},{"name":"accent_color","type":"color"}]'::jsonb);

  -- Sample project + completed render so workspace looks lived-in.
  INSERT INTO public.projects (workspace_id, created_by, name, status, brief) VALUES
    (_workspace_id, owner_id, '[Example] Summer Launch Campaign', 'active',
     E'Launch our summer collection across all channels.\n\n- Headline: "Made for sunlit days"\n- Subhead: "The 2026 Summer Edit is here."\n- CTA: "Shop the drop"')
    RETURNING id INTO project_id;

  INSERT INTO public.jobs (project_id, workspace_id, template_id, engine, status, brief, variables, completed_at)
  VALUES (project_id, _workspace_id, tpl_figma, 'figma', 'completed',
    '{"summary":"IG square hero"}'::jsonb,
    '{"headline":"Made for sunlit days","subhead":"2026 Summer Edit","cta":"Shop the drop","bg_color":"#FF6B5A"}'::jsonb,
    now() - interval '2 hours')
  RETURNING id INTO job_id;
  INSERT INTO public.outputs (job_id, kind, url, metadata) VALUES
    (job_id, 'png', 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=1080&h=1080&fit=crop', '{"width":1080,"height":1080,"channel":"instagram"}'::jsonb);
END;
$function$;
