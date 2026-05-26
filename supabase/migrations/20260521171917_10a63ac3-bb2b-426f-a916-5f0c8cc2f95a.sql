UPDATE public.templates
SET variables = variables || '[{"name":"client_image","type":"image","label":"Client Image","layer":"02_IMAGES","extracted":true}]'::jsonb
WHERE name = '[Live] Life Sciences Case Study – A4'
  AND NOT (variables @> '[{"name":"client_image"}]'::jsonb);