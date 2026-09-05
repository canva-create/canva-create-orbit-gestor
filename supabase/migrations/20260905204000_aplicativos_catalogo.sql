-- Migração: Criação da tabela aplicativos_catalogo para tabela de preços e catálogo de aplicativos
CREATE TABLE IF NOT EXISTS public.aplicativos_catalogo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  custo NUMERIC(10, 2) NOT NULL DEFAULT 11.00,
  valor_venda NUMERIC(10, 2) NOT NULL DEFAULT 25.00,
  categoria TEXT DEFAULT 'IPTV Player',
  observacao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.aplicativos_catalogo ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aplicativos_catalogo' AND policyname = 'Usuarios autenticados podem visualizar aplicativos'
  ) THEN
    CREATE POLICY "Usuarios autenticados podem visualizar aplicativos"
      ON public.aplicativos_catalogo FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aplicativos_catalogo' AND policyname = 'Usuarios autenticados podem inserir aplicativos'
  ) THEN
    CREATE POLICY "Usuarios autenticados podem inserir aplicativos"
      ON public.aplicativos_catalogo FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aplicativos_catalogo' AND policyname = 'Usuarios autenticados podem atualizar aplicativos'
  ) THEN
    CREATE POLICY "Usuarios autenticados podem atualizar aplicativos"
      ON public.aplicativos_catalogo FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aplicativos_catalogo' AND policyname = 'Usuarios autenticados podem excluir aplicativos'
  ) THEN
    CREATE POLICY "Usuarios autenticados podem excluir aplicativos"
      ON public.aplicativos_catalogo FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_aplicativos_catalogo_user_nome
  ON public.aplicativos_catalogo (user_id, nome);
