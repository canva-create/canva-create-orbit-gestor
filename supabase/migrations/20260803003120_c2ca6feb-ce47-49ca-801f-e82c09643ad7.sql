ALTER TABLE public.servidores
  ADD COLUMN IF NOT EXISTS login text,
  ADD COLUMN IF NOT EXISTS senha text,
  ADD COLUMN IF NOT EXISTS painel_unitv text,
  ADD COLUMN IF NOT EXISTS email_cadastrado text;