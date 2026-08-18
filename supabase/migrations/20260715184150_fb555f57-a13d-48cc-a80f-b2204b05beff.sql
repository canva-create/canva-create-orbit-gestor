
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_clientes_deleted_at ON public.clientes(deleted_at);

CREATE OR REPLACE FUNCTION public.excluir_todos_clientes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  n integer := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  WITH d AS (
    UPDATE public.clientes SET deleted_at = now()
    WHERE user_id = uid AND deleted_at IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO n FROM d;
  RETURN n;
END;
$function$;
