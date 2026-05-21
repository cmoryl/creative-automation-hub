
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS transient boolean;

CREATE INDEX IF NOT EXISTS jobs_claimable_idx
  ON public.jobs (workspace_id, engine, status, next_retry_at)
  WHERE status = 'queued';
