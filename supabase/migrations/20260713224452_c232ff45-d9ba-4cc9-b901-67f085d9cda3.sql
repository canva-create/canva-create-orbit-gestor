
-- Enums
CREATE TYPE public.cliente_status AS ENUM ('ativo','teste','vencido','cancelado','suspenso');
CREATE TYPE public.pagamento_status AS ENUM ('pago','devendo');
CREATE TYPE public.lembrete_tipo AS ENUM ('no_dia','1_dia_antes','vencimento','apos');

-- updated_at trigger fn
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- servidores
CREATE TABLE public.servidores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  custo_mensal NUMERIC(10,2) NOT NULL DEFAULT 0,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servidores TO authenticated;
GRANT ALL ON public.servidores TO service_role;
ALTER TABLE public.servidores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own servidores" ON public.servidores FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_servidores_updated BEFORE UPDATE ON public.servidores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- clientes
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT,
  servidor_id UUID REFERENCES public.servidores(id) ON DELETE SET NULL,
  data_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_vencimento DATE,
  status public.cliente_status NOT NULL DEFAULT 'ativo',
  status_pagamento public.pagamento_status NOT NULL DEFAULT 'devendo',
  valor_pago NUMERIC(10,2) NOT NULL DEFAULT 0,
  custo_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0,
  mac TEXT,
  device TEXT,
  aplicativo TEXT,
  observacao TEXT,
  lembrete_no_dia BOOLEAN NOT NULL DEFAULT false,
  lembrete_1_dia_antes BOOLEAN NOT NULL DEFAULT false,
  lembrete_vencimento BOOLEAN NOT NULL DEFAULT false,
  lembrete_apos BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own clientes" ON public.clientes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_clientes_updated BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_clientes_user ON public.clientes(user_id);
CREATE INDEX idx_clientes_venc ON public.clientes(data_vencimento);

-- historico_renovacoes
CREATE TABLE public.historico_renovacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  dias_adicionados INT NOT NULL DEFAULT 0,
  valor_recebido NUMERIC(10,2) NOT NULL DEFAULT 0,
  custo NUMERIC(10,2) NOT NULL DEFAULT 0,
  lucro NUMERIC(10,2) NOT NULL DEFAULT 0,
  vencimento_anterior DATE,
  vencimento_novo DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historico_renovacoes TO authenticated;
GRANT ALL ON public.historico_renovacoes TO service_role;
ALTER TABLE public.historico_renovacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own hist_ren" ON public.historico_renovacoes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_hist_ren_cliente ON public.historico_renovacoes(cliente_id);

-- historico_financeiro
CREATE TABLE public.historico_financeiro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  custo NUMERIC(10,2) NOT NULL DEFAULT 0,
  lucro NUMERIC(10,2) NOT NULL DEFAULT 0,
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historico_financeiro TO authenticated;
GRANT ALL ON public.historico_financeiro TO service_role;
ALTER TABLE public.historico_financeiro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own hist_fin" ON public.historico_financeiro FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_hist_fin_cliente ON public.historico_financeiro(cliente_id);
