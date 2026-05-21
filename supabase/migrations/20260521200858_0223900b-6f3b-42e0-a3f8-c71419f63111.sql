-- Restrict workspace_integrations SELECT to workspace owners only
-- so OAuth access tokens are not readable by all workspace members.
DROP POLICY IF EXISTS "integrations members metadata read" ON public.workspace_integrations;

CREATE POLICY "integrations owner read"
ON public.workspace_integrations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = workspace_integrations.workspace_id
      AND w.owner_id = auth.uid()
  )
);