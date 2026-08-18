-- 1. Tabela de Lixeira de Recuperação
CREATE TABLE IF NOT EXISTS public.lixeira (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tabela text NOT NULL,
    registro_id uuid NOT NULL,
    dados jsonb NOT NULL,
    excluido_em timestamptz DEFAULT now(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome_referencia text,
    UNIQUE(tabela, registro_id)
);

GRANT SELECT, INSERT, DELETE, UPDATE ON public.lixeira TO authenticated;
GRANT ALL ON public.lixeira TO service_role;
ALTER TABLE public.lixeira ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own trash" ON public.lixeira FOR ALL TO authenticated USING (auth.uid() = user_id);

-- 2. Tabela de Tarefas e Follow-up
CREATE TABLE IF NOT EXISTS public.tarefas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo text NOT NULL,
    descricao text,
    data_hora timestamptz NOT NULL,
    concluida boolean DEFAULT false,
    cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
    revendedor_id uuid REFERENCES public.revendedores(id) ON DELETE SET NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefas TO authenticated;
GRANT ALL ON public.tarefas TO service_role;
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own tasks" ON public.tarefas FOR ALL TO authenticated USING (auth.uid() = user_id);

-- 3. Tabela de Metas
CREATE TABLE IF NOT EXISTS public.metas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    valor_objetivo numeric NOT NULL,
    tipo text NOT NULL, -- 'faturamento', 'clientes_ativos', 'novas_vendas'
    periodo text NOT NULL, -- 'mensal', 'anual'
    mes integer,
    ano integer NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas TO authenticated;
GRANT ALL ON public.metas TO service_role;
ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own goals" ON public.metas FOR ALL TO authenticated USING (auth.uid() = user_id);

-- 4. Tabela de Configurações Financeiras
CREATE TABLE IF NOT EXISTS public.config_financeira (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    custo_padrao_credito numeric DEFAULT 0,
    valor_venda_padrao numeric DEFAULT 35,
    comissao_revenda_percentual numeric DEFAULT 0,
    regra_proporcional boolean DEFAULT true,
    updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.config_financeira TO authenticated;
GRANT ALL ON public.config_financeira TO service_role;
ALTER TABLE public.config_financeira ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own financial config" ON public.config_financeira FOR ALL TO authenticated USING (auth.uid() = user_id);
