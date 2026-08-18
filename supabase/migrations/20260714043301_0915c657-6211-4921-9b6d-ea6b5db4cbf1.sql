
CREATE OR REPLACE FUNCTION public.excluir_todos_clientes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n integer := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  DELETE FROM public.historico_renovacoes WHERE user_id = uid;
  DELETE FROM public.historico_financeiro WHERE user_id = uid;
  WITH d AS (DELETE FROM public.clientes WHERE user_id = uid RETURNING 1)
  SELECT count(*) INTO n FROM d;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.excluir_todos_clientes() TO authenticated;
