
-- Add new enum value for reseller sales
ALTER TYPE public.credito_mov_tipo ADD VALUE IF NOT EXISTS 'venda_revendedor';

-- Reseller status
DO $$ BEGIN
  CREATE TYPE public.revendedor_status AS ENUM ('ativo','vencido','suspenso');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.revendedor_mov_tipo AS ENUM ('venda','renovacao','ajuste_add','ajuste_rem');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.revendedores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  telefone TEXT,
  servidor_id UUID REFERENCES public.servidores(id) ON DELETE SET NULL,
  login TEXT,
  data_recarga DATE,
  dias_validade INTEGER NOT NULL DEFAULT 30,
  creditos INTEGER NOT NULL DEFAULT 0,
  status public.revendedor_status NOT NULL DEFAULT 'ativo',
  status_pagamento public.pagamento_status NOT NULL DEFAULT 'devendo',
  valor_compra NUMERIC NOT NULL DEFAULT 0,
  valor_venda NUMERIC NOT NULL DEFAULT 0,
  custo NUMERIC NOT NULL DEFAULT 0,
  lucro NUMERIC NOT NULL DEFAULT 0,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.revendedores TO authenticated;
GRANT ALL ON public.revendedores TO service_role;
ALTER TABLE public.revendedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own revendedores" ON public.revendedores
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_revendedores_updated_at
  BEFORE UPDATE ON public.revendedores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.revendedores_movimentacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  revendedor_id UUID NOT NULL REFERENCES public.revendedores(id) ON DELETE CASCADE,
  servidor_id UUID REFERENCES public.servidores(id) ON DELETE SET NULL,
  tipo public.revendedor_mov_tipo NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 0,
  valor_pago NUMERIC NOT NULL DEFAULT 0,
  custo NUMERIC NOT NULL DEFAULT 0,
  lucro NUMERIC NOT NULL DEFAULT 0,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.revendedores_movimentacoes TO authenticated;
GRANT ALL ON public.revendedores_movimentacoes TO service_role;
ALTER TABLE public.revendedores_movimentacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own revendedores_movs" ON public.revendedores_movimentacoes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
