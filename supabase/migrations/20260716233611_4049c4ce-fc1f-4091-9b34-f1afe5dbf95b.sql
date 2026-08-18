DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.revendedores; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.revendedores_movimentacoes; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.creditos_movimentacoes; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.revendedores REPLICA IDENTITY FULL;
ALTER TABLE public.revendedores_movimentacoes REPLICA IDENTITY FULL;
ALTER TABLE public.creditos_movimentacoes REPLICA IDENTITY FULL;