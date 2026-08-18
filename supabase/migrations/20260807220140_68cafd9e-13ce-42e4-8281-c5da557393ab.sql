CREATE TABLE public.ativacoes_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  servidor_id uuid REFERENCES public.servidores(id) ON DELETE SET NULL,
  cliente_nome text,
  mac text,
  device text,
  valor numeric NOT NULL DEFAULT 0,
  custo numeric NOT NULL DEFAULT 0,
  dias_validade integer NOT NULL DEFAULT 30,
  ativado_em timestamp with time zone NOT NULL DEFAULT now(),
  expira_em timestamp with time zone NOT NULL,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ativacoes_apps TO authenticated;
GRANT ALL ON public.ativacoes_apps TO service_role;

ALTER TABLE public.ativacoes_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios gerenciam suas ativacoes"
ON public.ativacoes_apps FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_ativacoes_apps_updated
BEFORE UPDATE ON public.ativacoes_apps
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_ativacoes_apps_user_created ON public.ativacoes_apps (user_id, created_at DESC);