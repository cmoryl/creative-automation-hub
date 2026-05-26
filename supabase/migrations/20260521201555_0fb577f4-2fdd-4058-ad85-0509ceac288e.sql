-- 1) Agent live status snapshot
CREATE TABLE public.agent_status (
  agent_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  host text,
  platform text,
  agent_version text,
  apps jsonb NOT NULL DEFAULT '{}'::jsonb,
  fonts_count integer NOT NULL DEFAULT 0,
  fonts_sample jsonb NOT NULL DEFAULT '[]'::jsonb,
  disk_free_mb integer,
  current_job_id uuid,
  templates_seen integer NOT NULL DEFAULT 0,
  reported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_status_workspace ON public.agent_status(workspace_id);

ALTER TABLE public.agent_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_status members read"
ON public.agent_status FOR SELECT
USING (public.is_workspace_member(auth.uid(), workspace_id));

-- 2) Per-template, per-agent availability
CREATE TABLE public.template_agent_availability (
  template_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  file_present boolean NOT NULL DEFAULT false,
  fonts_missing jsonb NOT NULL DEFAULT '[]'::jsonb,
  links_missing jsonb NOT NULL DEFAULT '[]'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, agent_id)
);
CREATE INDEX idx_taa_workspace ON public.template_agent_availability(workspace_id);
CREATE INDEX idx_taa_template ON public.template_agent_availability(template_id);

ALTER TABLE public.template_agent_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "taa members read"
ON public.template_agent_availability FOR SELECT
USING (public.is_workspace_member(auth.uid(), workspace_id));

-- 3) Template requirements (fonts, links, notes)
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS requirements jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 4) Structured render error report on jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS error_stage text,
  ADD COLUMN IF NOT EXISTS error_detail jsonb;