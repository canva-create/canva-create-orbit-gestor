ALTER TABLE public.historico_renovacoes ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativa';
ALTER TABLE public.historico_renovacoes ADD COLUMN IF NOT EXISTS cancelado_em timestamptz;
CREATE INDEX IF NOT EXISTS idx_hist_ren_status ON public.historico_renovacoes(status);