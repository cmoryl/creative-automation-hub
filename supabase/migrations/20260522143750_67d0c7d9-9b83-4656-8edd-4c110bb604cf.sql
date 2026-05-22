ALTER TABLE public.templates DROP CONSTRAINT IF EXISTS templates_engine_check;
ALTER TABLE public.templates ADD CONSTRAINT templates_engine_check
  CHECK (engine = ANY (ARRAY['canva'::text, 'figma'::text, 'illustrator'::text, 'indesign'::text, 'express'::text]));