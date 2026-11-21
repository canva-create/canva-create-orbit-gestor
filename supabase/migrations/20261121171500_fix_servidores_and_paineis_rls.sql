-- Migração para corrigir visibilidade e RLS de servidores e paineis_info
-- Permite que usuários autenticados visualizem e gerenciem os servidores cadastrados,
-- evitando que restrições rígidas de user_id ou migrações de contas ocultem os registros.

-- 1. Garantir que user_id não seja restritivo obrigatório se não fornecido
ALTER TABLE public.servidores ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.paineis_info ALTER COLUMN user_id DROP NOT NULL;

-- 2. Remover políticas legadas e restritivas
DROP POLICY IF EXISTS "own servidores" ON public.servidores;
DROP POLICY IF EXISTS "own paineis_info" ON public.paineis_info;

-- 3. Políticas para public.servidores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'servidores' AND policyname = 'Permitir leitura de servidores para autenticados'
  ) THEN
    CREATE POLICY "Permitir leitura de servidores para autenticados"
      ON public.servidores FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'servidores' AND policyname = 'Permitir insercao de servidores para autenticados'
  ) THEN
    CREATE POLICY "Permitir insercao de servidores para autenticados"
      ON public.servidores FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'servidores' AND policyname = 'Permitir atualizacao de servidores para autenticados'
  ) THEN
    CREATE POLICY "Permitir atualizacao de servidores para autenticados"
      ON public.servidores FOR UPDATE
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'servidores' AND policyname = 'Permitir exclusao de servidores para autenticados'
  ) THEN
    CREATE POLICY "Permitir exclusao de servidores para autenticados"
      ON public.servidores FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- 4. Políticas para public.paineis_info
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'paineis_info' AND policyname = 'Permitir leitura de paineis_info para autenticados'
  ) THEN
    CREATE POLICY "Permitir leitura de paineis_info para autenticados"
      ON public.paineis_info FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'paineis_info' AND policyname = 'Permitir insercao de paineis_info para autenticados'
  ) THEN
    CREATE POLICY "Permitir insercao de paineis_info para autenticados"
      ON public.paineis_info FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'paineis_info' AND policyname = 'Permitir atualizacao de paineis_info para autenticados'
  ) THEN
    CREATE POLICY "Permitir atualizacao de paineis_info para autenticados"
      ON public.paineis_info FOR UPDATE
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'paineis_info' AND policyname = 'Permitir exclusao de paineis_info para autenticados'
  ) THEN
    CREATE POLICY "Permitir exclusao de paineis_info para autenticados"
      ON public.paineis_info FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- 5. Garantir permissões de acesso às roles authenticated e service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servidores TO authenticated;
GRANT ALL ON public.servidores TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paineis_info TO authenticated;
GRANT ALL ON public.paineis_info TO service_role;
