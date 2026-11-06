-- Migração para permitir frações de créditos nas movimentações
ALTER TABLE public.creditos_movimentacoes 
  ALTER COLUMN quantidade TYPE NUMERIC;

ALTER TABLE public.revendedores_movimentacoes 
  ALTER COLUMN quantidade TYPE NUMERIC;
