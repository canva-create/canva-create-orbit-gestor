-- Migração: Adicionar site_url e fracao_creditos na tabela aplicativos_catalogo
ALTER TABLE public.aplicativos_catalogo 
  ADD COLUMN IF NOT EXISTS site_url TEXT,
  ADD COLUMN IF NOT EXISTS fracao_creditos NUMERIC(10, 4) DEFAULT 1.0;
