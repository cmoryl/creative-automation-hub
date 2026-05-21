CREATE UNIQUE INDEX IF NOT EXISTS templates_workspace_source_ref_uidx
  ON public.templates (workspace_id, source_ref)
  WHERE source_ref IS NOT NULL;