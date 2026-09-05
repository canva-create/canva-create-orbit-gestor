-- Migração de Otimização de Performance e Índices do Banco de Dados
-- Orbit Gestor

-- 1. Índices Compostos para Consultas Frequentes na Base de Clientes
CREATE INDEX IF NOT EXISTS idx_clientes_user_del_status
  ON public.clientes(user_id, deleted_at, status);

CREATE INDEX IF NOT EXISTS idx_clientes_user_servidor
  ON public.clientes(user_id, servidor_id)
  WHERE deleted_at IS NULL;

-- 2. Índices para Consultas de Renovações e Faturamento
CREATE INDEX IF NOT EXISTS idx_hist_ren_user_created
  ON public.historico_renovacoes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hist_ren_user_status_pag
  ON public.historico_renovacoes(user_id, status, status_pagamento);

-- 3. Índices para Movimentações de Revendedores e Ativações
CREATE INDEX IF NOT EXISTS idx_rev_movs_user_tipo_status
  ON public.revendedores_movimentacoes(user_id, tipo, status_venda, status_pagamento);

CREATE INDEX IF NOT EXISTS idx_ativacoes_apps_user_ativado
  ON public.ativacoes_apps(user_id, ativado_em DESC);

-- 4. Função RPC para Obter Métricas da Dashboard Diretamente no PostgreSQL
-- Permite obter contagens e somas instantaneamente sem carregar tabelas inteiras no cliente.
CREATE OR REPLACE FUNCTION public.obter_metricas_dashboard()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_resultado JSON;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Não autenticado');
  END IF;

  SELECT json_build_object(
    'total_ativos', (
      SELECT COUNT(*)
      FROM public.clientes
      WHERE user_id = v_user_id
        AND deleted_at IS NULL
        AND status = 'ativo'
        AND (data_vencimento IS NULL OR data_vencimento >= CURRENT_DATE)
    ),
    'total_vencidos', (
      SELECT COUNT(*)
      FROM public.clientes
      WHERE user_id = v_user_id
        AND deleted_at IS NULL
        AND (status = 'vencido' OR (data_vencimento IS NOT NULL AND data_vencimento < CURRENT_DATE))
    ),
    'faturamento_mes_atual', (
      COALESCE((
        SELECT SUM(valor_recebido)
        FROM public.historico_renovacoes
        WHERE user_id = v_user_id
          AND status != 'cancelada'
          AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)
      ), 0)
      + COALESCE((
        SELECT SUM(valor_pago)
        FROM public.revendedores_movimentacoes
        WHERE user_id = v_user_id
          AND tipo = 'venda'
          AND status_venda != 'cancelada'
          AND status_pagamento = 'pago'
          AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)
      ), 0)
      + COALESCE((
        SELECT SUM(valor)
        FROM public.ativacoes_apps
        WHERE user_id = v_user_id
          AND date_trunc('month', ativado_em) = date_trunc('month', CURRENT_DATE)
      ), 0)
    ),
    'lucro_mes_atual', (
      COALESCE((
        SELECT SUM(lucro)
        FROM public.historico_renovacoes
        WHERE user_id = v_user_id
          AND status != 'cancelada'
          AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)
      ), 0)
      + COALESCE((
        SELECT SUM(lucro)
        FROM public.revendedores_movimentacoes
        WHERE user_id = v_user_id
          AND tipo = 'venda'
          AND status_venda != 'cancelada'
          AND status_pagamento = 'pago'
          AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)
      ), 0)
      + COALESCE((
        SELECT SUM(valor - custo)
        FROM public.ativacoes_apps
        WHERE user_id = v_user_id
          AND date_trunc('month', ativado_em) = date_trunc('month', CURRENT_DATE)
      ), 0)
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obter_metricas_dashboard() TO authenticated;
