
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "users read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Licencas
CREATE TABLE public.licencas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  dias_duracao INTEGER,
  data_expiracao TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativa',
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_email TEXT,
  dispositivos_permitidos INTEGER NOT NULL DEFAULT 1,
  observacoes TEXT,
  criada_por UUID REFERENCES auth.users(id),
  ativada_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licencas TO authenticated;
GRANT ALL ON public.licencas TO service_role;
ALTER TABLE public.licencas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage licencas" ON public.licencas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "users read own licenca" ON public.licencas FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());
CREATE POLICY "users update to activate" ON public.licencas FOR UPDATE TO authenticated
  USING (usuario_id IS NULL AND status = 'ativa') WITH CHECK (usuario_id = auth.uid());

CREATE TRIGGER trg_licencas_updated BEFORE UPDATE ON public.licencas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ativacoes
CREATE TABLE public.licencas_ativacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licenca_id UUID NOT NULL REFERENCES public.licencas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usuario_email TEXT,
  dispositivo TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.licencas_ativacoes TO authenticated;
GRANT ALL ON public.licencas_ativacoes TO service_role;
ALTER TABLE public.licencas_ativacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user sees own activations" ON public.licencas_ativacoes FOR SELECT TO authenticated USING (usuario_id = auth.uid());
CREATE POLICY "admin sees all activations" ON public.licencas_ativacoes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user inserts own activation" ON public.licencas_ativacoes FOR INSERT TO authenticated WITH CHECK (usuario_id = auth.uid());

-- Ativar licença
CREATE OR REPLACE FUNCTION public.ativar_licenca(_codigo TEXT, _dispositivo TEXT DEFAULT NULL, _user_agent TEXT DEFAULT NULL)
RETURNS public.licencas LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  lic public.licencas;
  email TEXT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT au.email INTO email FROM auth.users au WHERE au.id = uid;

  SELECT * INTO lic FROM public.licencas WHERE codigo = _codigo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chave inválida'; END IF;
  IF lic.status = 'bloqueada' THEN RAISE EXCEPTION 'Chave bloqueada'; END IF;
  IF lic.data_expiracao < now() THEN
    UPDATE public.licencas SET status = 'expirada' WHERE id = lic.id;
    RAISE EXCEPTION 'Chave expirada';
  END IF;
  IF lic.usuario_id IS NOT NULL AND lic.usuario_id <> uid THEN
    RAISE EXCEPTION 'Chave já vinculada a outro usuário';
  END IF;

  UPDATE public.licencas SET
    usuario_id = uid,
    usuario_email = COALESCE(usuario_email, email),
    status = 'utilizada',
    ativada_em = COALESCE(ativada_em, now())
  WHERE id = lic.id
  RETURNING * INTO lic;

  INSERT INTO public.licencas_ativacoes (licenca_id, usuario_id, usuario_email, dispositivo, user_agent)
  VALUES (lic.id, uid, email, _dispositivo, _user_agent);

  RETURN lic;
END; $$;

-- Licença válida atual
CREATE OR REPLACE FUNCTION public.minha_licenca_valida()
RETURNS public.licencas LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.licencas
  WHERE usuario_id = auth.uid() AND status IN ('ativa','utilizada') AND data_expiracao > now()
  ORDER BY data_expiracao DESC LIMIT 1;
$$;

-- Primeiro usuário vira admin
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- Promove usuários existentes: o mais antigo vira admin, demais viram user
INSERT INTO public.user_roles (user_id, role)
SELECT id, CASE WHEN row_number() OVER (ORDER BY created_at) = 1 THEN 'admin'::public.app_role ELSE 'user'::public.app_role END
FROM auth.users
ON CONFLICT DO NOTHING;
