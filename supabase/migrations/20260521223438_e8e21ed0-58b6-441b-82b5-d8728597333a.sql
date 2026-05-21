
-- ============ output_comments ============
CREATE TABLE public.output_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  output_id UUID NOT NULL REFERENCES public.outputs(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  parent_id UUID REFERENCES public.output_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX output_comments_output_idx ON public.output_comments(output_id, created_at);
ALTER TABLE public.output_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments members read" ON public.output_comments
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "comments members write" ON public.output_comments
  FOR INSERT WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) AND author_id = auth.uid());
CREATE POLICY "comments author delete" ON public.output_comments
  FOR DELETE USING (author_id = auth.uid());

-- ============ share_links ============
CREATE TABLE public.share_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('output','batch')),
  output_id UUID REFERENCES public.outputs(id) ON DELETE CASCADE,
  batch_key TEXT,
  created_by UUID NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  view_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX share_links_workspace_idx ON public.share_links(workspace_id, created_at DESC);
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "share members rw" ON public.share_links
  FOR ALL
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

-- ============ workspace_webhooks ============
CREATE TABLE public.workspace_webhooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  url TEXT NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2000),
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY['job.completed','job.failed'],
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
ALTER TABLE public.workspace_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhooks members rw" ON public.workspace_webhooks
  FOR ALL
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE TABLE public.workspace_webhook_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  webhook_id UUID NOT NULL REFERENCES public.workspace_webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  status_code INT,
  ok BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX webhook_deliveries_webhook_idx ON public.workspace_webhook_deliveries(webhook_id, created_at DESC);
ALTER TABLE public.workspace_webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook deliveries members read" ON public.workspace_webhook_deliveries
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));

-- ============ batch_schedules ============
CREATE TABLE public.batch_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  payload JSONB NOT NULL,
  run_at TIMESTAMPTZ NOT NULL,
  cron TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dispatched','failed','cancelled')),
  dispatched_at TIMESTAMPTZ,
  error TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX batch_schedules_due_idx ON public.batch_schedules(status, run_at);
ALTER TABLE public.batch_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedules members rw" ON public.batch_schedules
  FOR ALL
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

-- ============ API token scopes ============
ALTER TABLE public.workspace_api_tokens
  ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT ARRAY['jobs:read','jobs:write'];
