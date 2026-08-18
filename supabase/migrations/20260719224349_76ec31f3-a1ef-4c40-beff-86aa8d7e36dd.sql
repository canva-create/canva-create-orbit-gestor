
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  categoria TEXT NOT NULL,
  acao TEXT NOT NULL,
  descricao TEXT,
  entidade TEXT,
  entidade_id TEXT,
  entidade_nome TEXT,
  dados_anteriores JSONB,
  dados_novos JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select_own" ON public.audit_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "audit_logs_insert_own" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX audit_logs_user_created_idx ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX audit_logs_categoria_idx ON public.audit_logs (user_id, categoria, created_at DESC);
