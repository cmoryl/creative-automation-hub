
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-outputs', 'job-outputs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow workspace members to read their own job outputs.
CREATE POLICY "job-outputs members read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'job-outputs'
  AND public.is_workspace_member(
    auth.uid(),
    (string_to_array(name, '/'))[1]::uuid
  )
);
