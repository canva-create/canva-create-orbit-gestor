ALTER TABLE public.revendedores_movimentacoes
  ADD COLUMN IF NOT EXISTS status_pagamento pagamento_status NOT NULL DEFAULT 'devendo';

-- Preserva histórico: vendas já existentes são consideradas pagas
UPDATE public.revendedores_movimentacoes
   SET status_pagamento = 'pago'
 WHERE tipo = 'venda' AND status_pagamento = 'devendo';

CREATE INDEX IF NOT EXISTS revendedores_movs_status_pagamento_idx
  ON public.revendedores_movimentacoes (status_pagamento);