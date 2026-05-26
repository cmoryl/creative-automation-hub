-- Enable realtime change feeds for jobs + outputs so the UI can react live.
ALTER TABLE public.jobs REPLICA IDENTITY FULL;
ALTER TABLE public.outputs REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'outputs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.outputs;
  END IF;
END $$;