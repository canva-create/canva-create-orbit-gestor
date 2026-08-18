
-- Revoke public execute on SECURITY DEFINER functions and grant only where needed

-- Trigger function: no direct execution needed
REVOKE ALL ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;

-- User-callable RPCs: restrict to authenticated only
REVOKE ALL ON FUNCTION public.excluir_todos_clientes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_todos_clientes() TO authenticated;

REVOKE ALL ON FUNCTION public.minha_licenca_valida() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minha_licenca_valida() TO authenticated;

REVOKE ALL ON FUNCTION public.ativar_licenca(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ativar_licenca(text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
