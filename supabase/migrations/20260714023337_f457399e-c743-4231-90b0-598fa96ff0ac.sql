-- Tipos
CREATE TYPE public.credito_mov_tipo AS ENUM ('compra', 'ativacao', 'renovacao', 'ajuste_add', 'ajuste_rem', 'transferencia');

-- Compras de créditos
CREATE TABLE public.creditos_compras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  servidor_id UUID NOT NULL REFERENCES public.servidores(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  valor_unitario NUMERIC NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  valor_total NUMERIC GENERATED ALWAYS AS (quantidade * valor_unitario) STORED,
  data_compra DATE NOT NULL DEFAULT CURRENT_DATE,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creditos_compras TO authenticated;
GRANT ALL ON public.creditos_compras TO service_role;
ALTER TABLE public.creditos_compras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own creditos_compras" ON public.creditos_compras
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_creditos_compras_updated
BEFORE UPDATE ON public.creditos_compras
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_creditos_compras_user ON public.creditos_compras(user_id, servidor_id);

-- Movimentações
CREATE TABLE public.creditos_movimentacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  servidor_id UUID NOT NULL REFERENCES public.servidores(id) ON DELETE CASCADE,
  tipo public.credito_mov_tipo NOT NULL,
  quantidade INTEGER NOT NULL, -- positivo = entrada, negativo = saída
  motivo TEXT,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  compra_id UUID REFERENCES public.creditos_compras(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creditos_movimentacoes TO authenticated;
GRANT ALL ON public.creditos_movimentacoes TO service_role;
ALTER TABLE public.creditos_movimentacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own creditos_movimentacoes" ON public.creditos_movimentacoes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_creditos_mov_user_servidor ON public.creditos_movimentacoes(user_id, servidor_id, created_at DESC);

-- Função que retorna saldo por servidor do usuário logado
CREATE OR REPLACE FUNCTION public.creditos_saldos()
RETURNS TABLE(servidor_id UUID, saldo BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT servidor_id, COALESCE(SUM(quantidade), 0)::BIGINT AS saldo
  FROM public.creditos_movimentacoes
  WHERE user_id = auth.uid()
  GROUP BY servidor_id;
$$;

GRANT EXECUTE ON FUNCTION public.creditos_saldos() TO authenticated;