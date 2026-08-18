CREATE TABLE public.integracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  nome text NOT NULL DEFAULT '',
  credenciais jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'desconectado',
  ultimo_teste_ok boolean,
  ultimo_teste_msg text,
  ultima_sync timestamptz,
  ultima_notificacao timestamptz,
  webhook_token text NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider),
  UNIQUE (webhook_token)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integracoes TO authenticated;
GRANT ALL ON public.integracoes TO service_role;
ALTER TABLE public.integracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own integracoes" ON public.integracoes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER integracoes_updated_at BEFORE UPDATE ON public.integracoes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.pix_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  transacao_id text,
  valor numeric NOT NULL DEFAULT 0,
  pagador_nome text,
  pagador_documento text,
  instituicao text,
  status text NOT NULL DEFAULT 'recebido',
  descricao text,
  pago_em timestamptz NOT NULL DEFAULT now(),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, transacao_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pix_pagamentos TO authenticated;
GRANT ALL ON public.pix_pagamentos TO service_role;
ALTER TABLE public.pix_pagamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pix_pagamentos" ON public.pix_pagamentos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX pix_pagamentos_user_data_idx ON public.pix_pagamentos (user_id, pago_em DESC);