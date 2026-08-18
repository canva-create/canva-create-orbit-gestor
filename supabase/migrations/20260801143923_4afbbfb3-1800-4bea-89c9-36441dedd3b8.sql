CREATE TABLE public.backups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'concluido',
  erro_msg text,
  tamanho_bytes bigint NOT NULL DEFAULT 0,
  registros jsonb NOT NULL DEFAULT '{}'::jsonb,
  conteudo jsonb,
  referencia_dia date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  exportado_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backups TO authenticated;
GRANT ALL ON public.backups TO service_role;

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários gerenciam seus próprios backups"
ON public.backups FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX backups_user_created_idx ON public.backups (user_id, created_at DESC);
CREATE UNIQUE INDEX backups_auto_dia_idx ON public.backups (user_id, referencia_dia) WHERE tipo = 'automatico';

CREATE TRIGGER set_backups_updated_at
BEFORE UPDATE ON public.backups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();