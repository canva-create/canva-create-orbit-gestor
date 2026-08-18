CREATE TABLE public.mensagens_rapidas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mensagens_rapidas TO authenticated;
GRANT ALL ON public.mensagens_rapidas TO service_role;
ALTER TABLE public.mensagens_rapidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own mensagens_rapidas" ON public.mensagens_rapidas FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER set_updated_at_mensagens_rapidas BEFORE UPDATE ON public.mensagens_rapidas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.links_pagamento (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  link TEXT NOT NULL DEFAULT '',
  mensagem TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.links_pagamento TO authenticated;
GRANT ALL ON public.links_pagamento TO service_role;
ALTER TABLE public.links_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own links_pagamento" ON public.links_pagamento FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER set_updated_at_links_pagamento BEFORE UPDATE ON public.links_pagamento FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();