-- Workspace API tokens for external clients (Claude skill, Claude Code, CI)
CREATE TABLE public.workspace_api_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wat_workspace ON public.workspace_api_tokens(workspace_id);
CREATE INDEX idx_wat_hash ON public.workspace_api_tokens(token_hash);

ALTER TABLE public.workspace_api_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api tokens members read"
  ON public.workspace_api_tokens FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "api tokens members insert"
  ON public.workspace_api_tokens FOR INSERT
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) AND auth.uid() = created_by);

CREATE POLICY "api tokens members delete"
  ON public.workspace_api_tokens FOR DELETE
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Allow hybrid engine in jobs (no enum, engine is TEXT so nothing to alter, but document)
COMMENT ON COLUMN public.jobs.engine IS 'illustrator|indesign|figma|canva|hybrid|mock';