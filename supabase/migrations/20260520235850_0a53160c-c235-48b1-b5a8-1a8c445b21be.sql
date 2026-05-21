-- Approval status enum
DO $$ BEGIN
  CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'changes_requested', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Batch approvals: a batch is identified by (project_id, batch_label) on jobs.row_label prefix,
-- but we model approvals against a generic "subject" so it works for batches today and other artifacts later.
CREATE TABLE IF NOT EXISTS public.batch_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  batch_key text NOT NULL,
  title text NOT NULL,
  status public.approval_status NOT NULL DEFAULT 'pending',
  submitted_by uuid NOT NULL,
  reviewer_id uuid,
  reviewer_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE INDEX IF NOT EXISTS batch_approvals_workspace_idx ON public.batch_approvals (workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS batch_approvals_project_idx ON public.batch_approvals (project_id);

ALTER TABLE public.batch_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approvals members read"
  ON public.batch_approvals FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "approvals members write"
  ON public.batch_approvals FOR ALL
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER batch_approvals_touch
  BEFORE UPDATE ON public.batch_approvals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Audit events
CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  project_id uuid,
  summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_workspace_idx ON public.audit_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_project_idx ON public.audit_events (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_target_idx ON public.audit_events (target_type, target_id);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit members read"
  ON public.audit_events FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "audit members insert"
  ON public.audit_events FOR INSERT
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

-- Track approval submission on jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS submitted_for_approval_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_id uuid;