
-- Lock down search_path and revoke public execute on internal helpers
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon;
