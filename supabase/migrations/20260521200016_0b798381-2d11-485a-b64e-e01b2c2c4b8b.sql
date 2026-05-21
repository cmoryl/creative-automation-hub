
-- Revoke direct execute access on SECURITY DEFINER functions from public roles.
-- These functions are used internally by triggers (which run as table owner)
-- and by the seed process; authenticated/anon users should not call them directly.
REVOKE EXECUTE ON FUNCTION public.seed_workspace_examples(uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.workspaces_after_insert_seed() FROM authenticated, anon;
