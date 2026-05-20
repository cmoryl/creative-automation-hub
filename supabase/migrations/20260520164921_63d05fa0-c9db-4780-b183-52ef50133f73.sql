REVOKE EXECUTE ON FUNCTION public.seed_workspace_examples(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_workspace_examples(uuid) TO service_role;