CREATE OR REPLACE FUNCTION public.creditos_saldos()
RETURNS TABLE(servidor_id UUID, saldo BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT servidor_id, COALESCE(SUM(quantidade), 0)::BIGINT AS saldo
  FROM public.creditos_movimentacoes
  WHERE user_id = auth.uid()
  GROUP BY servidor_id;
$$;