
ALTER TABLE public.revendedores_movimentacoes
  ADD COLUMN IF NOT EXISTS status_venda text NOT NULL DEFAULT 'ativa',
  ADD COLUMN IF NOT EXISTS cancelada_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelada_por uuid,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

CREATE INDEX IF NOT EXISTS revendedores_movs_status_venda_idx
  ON public.revendedores_movimentacoes (status_venda);
