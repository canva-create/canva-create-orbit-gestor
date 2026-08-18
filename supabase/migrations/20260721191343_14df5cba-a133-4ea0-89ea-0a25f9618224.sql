ALTER TABLE public.historico_renovacoes
  ADD COLUMN IF NOT EXISTS status_pagamento public.pagamento_status NOT NULL DEFAULT 'pago',
  ADD COLUMN IF NOT EXISTS valor_pendente numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pago_em timestamptz;

CREATE INDEX IF NOT EXISTS historico_renovacoes_status_pag_idx
  ON public.historico_renovacoes (status_pagamento);