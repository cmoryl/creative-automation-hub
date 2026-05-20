
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS engine TEXT NOT NULL DEFAULT 'mock',
  ADD COLUMN IF NOT EXISTS assigned_agent_id UUID,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS workspace_id UUID;

-- Backfill workspace_id from project
UPDATE public.jobs j
SET workspace_id = p.workspace_id
FROM public.projects p
WHERE j.project_id = p.id AND j.workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS jobs_workspace_engine_status_idx
  ON public.jobs (workspace_id, engine, status);

-- Trigger to keep workspace_id and updated_at in sync
CREATE OR REPLACE FUNCTION public.jobs_set_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.projects WHERE id = NEW.project_id;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_set_workspace_trg ON public.jobs;
CREATE TRIGGER jobs_set_workspace_trg
BEFORE INSERT OR UPDATE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.jobs_set_workspace();

-- Workspace integrations: Figma PAT, Canva token, etc. (stored server-side only)
CREATE TABLE IF NOT EXISTS public.workspace_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);

ALTER TABLE public.workspace_integrations ENABLE ROW LEVEL SECURITY;

-- Members can SEE that an integration exists (metadata only) but NOT read access_token.
-- We expose token only via server functions using service role.
CREATE POLICY "integrations members metadata read"
ON public.workspace_integrations FOR SELECT
USING (is_workspace_member(auth.uid(), workspace_id));

-- No direct INSERT/UPDATE/DELETE from clients — only server functions via service role.
