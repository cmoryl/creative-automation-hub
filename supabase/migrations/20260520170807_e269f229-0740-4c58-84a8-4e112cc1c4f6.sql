-- Add row_label to jobs so we can group multi-engine variations per source row
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS row_label text;

-- Create private brief-uploads bucket for CSVs and reference images
INSERT INTO storage.buckets (id, name, public)
VALUES ('brief-uploads', 'brief-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: workspace members can read/write files under {workspace_id}/...
CREATE POLICY "brief-uploads members read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'brief-uploads'
  AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "brief-uploads members insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'brief-uploads'
  AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "brief-uploads members update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'brief-uploads'
  AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "brief-uploads members delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'brief-uploads'
  AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);