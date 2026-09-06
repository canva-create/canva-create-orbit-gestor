-- Criar tabela de aplicativos e sites oficiais (subcategoria independente de custos)
CREATE TABLE IF NOT EXISTS public.aplicativos_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  categoria TEXT DEFAULT 'Player IPTV',
  site_url TEXT,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar Row Level Security
ALTER TABLE public.aplicativos_sites ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso permissivas para usuários autenticados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aplicativos_sites' AND policyname = 'Permitir leitura de aplicativos_sites para autenticados'
  ) THEN
    CREATE POLICY "Permitir leitura de aplicativos_sites para autenticados"
      ON public.aplicativos_sites FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aplicativos_sites' AND policyname = 'Permitir insercao de aplicativos_sites para autenticados'
  ) THEN
    CREATE POLICY "Permitir insercao de aplicativos_sites para autenticados"
      ON public.aplicativos_sites FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aplicativos_sites' AND policyname = 'Permitir atualizacao de aplicativos_sites para autenticados'
  ) THEN
    CREATE POLICY "Permitir atualizacao de aplicativos_sites para autenticados"
      ON public.aplicativos_sites FOR UPDATE
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aplicativos_sites' AND policyname = 'Permitir exclusao de aplicativos_sites para autenticados'
  ) THEN
    CREATE POLICY "Permitir exclusao de aplicativos_sites para autenticados"
      ON public.aplicativos_sites FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;
