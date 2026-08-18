UPDATE public.clientes
SET status = 'ativo'
WHERE deleted_at IS NULL
  AND status = 'vencido'
  AND data_vencimento IS NOT NULL
  AND data_vencimento >= CURRENT_DATE;