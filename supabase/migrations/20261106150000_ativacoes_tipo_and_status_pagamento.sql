-- Migration para adicionar tipo_ativacao, revendedor_id, cliente_id, status_pagamento e valor_devendo à tabela ativacoes_apps
ALTER TABLE public.ativacoes_apps 
  ADD COLUMN IF NOT EXISTS tipo_ativacao TEXT NOT NULL DEFAULT 'cliente',
  ADD COLUMN IF NOT EXISTS revendedor_id UUID REFERENCES public.revendedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_pagamento TEXT NOT NULL DEFAULT 'pago',
  ADD COLUMN IF NOT EXISTS valor_devendo NUMERIC NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ativacoes_apps_status_pagamento 
  ON public.ativacoes_apps(user_id, status_pagamento);
