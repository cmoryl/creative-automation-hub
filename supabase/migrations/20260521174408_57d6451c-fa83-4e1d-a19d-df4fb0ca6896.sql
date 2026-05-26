DROP POLICY IF EXISTS "job-outputs members insert" ON storage.objects;
DROP POLICY IF EXISTS "job-outputs members update" ON storage.objects;
DROP POLICY IF EXISTS "job-outputs members delete" ON storage.objects;

CREATE POLICY "job-outputs members insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'job-outputs'
  AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "job-outputs members update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'job-outputs'
  AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "job-outputs members delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'job-outputs'
  AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);