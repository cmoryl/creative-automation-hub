
REVOKE EXECUTE ON FUNCTION public.seed_workspace_examples(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.workspaces_after_insert_seed() FROM PUBLIC, anon, authenticated;
