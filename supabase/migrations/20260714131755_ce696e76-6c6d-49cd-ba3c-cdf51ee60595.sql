CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.paineis_info (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  servidor TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  login TEXT NOT NULL DEFAULT '',
  senha TEXT NOT NULL DEFAULT '',
  painel_unitv TEXT NOT NULL DEFAULT '',
  email_cadastrado TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paineis_info TO authenticated;
GRANT ALL ON public.paineis_info TO service_role;
ALTER TABLE public.paineis_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own paineis_info" ON public.paineis_info FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_paineis_info_updated BEFORE UPDATE ON public.paineis_info FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();