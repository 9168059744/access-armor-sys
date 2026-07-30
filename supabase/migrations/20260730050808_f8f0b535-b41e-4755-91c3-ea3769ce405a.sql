CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated, service_role;

ALTER POLICY user_roles_select_own_or_admin ON public.user_roles USING ((user_id = auth.uid()) OR app_private.has_role(auth.uid(), 'admin'));
ALTER POLICY mfa_select_own_or_admin ON public.mfa_factors USING ((user_id = auth.uid()) OR app_private.has_role(auth.uid(), 'admin'));
ALTER POLICY auth_events_select_own_or_admin ON public.auth_events USING ((user_id = auth.uid()) OR app_private.has_role(auth.uid(), 'admin'));
ALTER POLICY admin_actions_admin_read ON public.admin_actions USING (app_private.has_role(auth.uid(), 'admin'));
ALTER POLICY login_attempts_admin_read ON public.login_attempts USING (app_private.has_role(auth.uid(), 'admin'));
ALTER POLICY profiles_select_own_or_admin ON public.profiles USING ((id = auth.uid()) OR app_private.has_role(auth.uid(), 'admin'));
ALTER POLICY profiles_update_own_or_admin ON public.profiles USING ((id = auth.uid()) OR app_private.has_role(auth.uid(), 'admin')) WITH CHECK ((id = auth.uid()) OR app_private.has_role(auth.uid(), 'admin'));
ALTER POLICY settings_update_admin ON public.security_settings USING (app_private.has_role(auth.uid(), 'admin')) WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);