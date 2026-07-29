
-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT 'General',
  job_title text NOT NULL DEFAULT 'Employee',
  phone text,
  mfa_enabled boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  locked_at timestamptz,
  security_score integer NOT NULL DEFAULT 40,
  last_login_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "profiles_select_own_or_admin" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own_or_admin" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_select_own_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- MFA FACTORS
CREATE TABLE public.mfa_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  secret text NOT NULL,
  device_name text NOT NULL DEFAULT 'Authenticator app',
  confirmed_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mfa_factors TO authenticated;
GRANT ALL ON public.mfa_factors TO service_role;
ALTER TABLE public.mfa_factors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mfa_select_own_or_admin" ON public.mfa_factors FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "mfa_write_own" ON public.mfa_factors FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- BACKUP CODES
CREATE TABLE public.backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_codes TO authenticated;
GRANT ALL ON public.backup_codes TO service_role;
ALTER TABLE public.backup_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backup_codes_own" ON public.backup_codes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- AUTH EVENTS
CREATE TABLE public.auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  event_type text NOT NULL,
  success boolean NOT NULL DEFAULT true,
  ip_address text,
  user_agent text,
  device text,
  location text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.auth_events TO authenticated;
GRANT ALL ON public.auth_events TO service_role;
ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_events_select_own_or_admin" ON public.auth_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "auth_events_insert_own" ON public.auth_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- LOGIN ATTEMPTS
CREATE TABLE public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_address text,
  success boolean NOT NULL DEFAULT false,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.login_attempts TO authenticated;
GRANT ALL ON public.login_attempts TO service_role;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "login_attempts_admin_read" ON public.login_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- SECURITY SETTINGS
CREATE TABLE public.security_settings (
  id integer PRIMARY KEY DEFAULT 1,
  require_mfa boolean NOT NULL DEFAULT true,
  lockout_threshold integer NOT NULL DEFAULT 5,
  lockout_minutes integer NOT NULL DEFAULT 30,
  session_timeout_minutes integer NOT NULL DEFAULT 60,
  password_min_length integer NOT NULL DEFAULT 12,
  require_backup_codes boolean NOT NULL DEFAULT true,
  allow_sms_fallback boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_settings_singleton CHECK (id = 1)
);
GRANT SELECT ON public.security_settings TO authenticated;
GRANT ALL ON public.security_settings TO service_role;
ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_read_all_auth" ON public.security_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_update_admin" ON public.security_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.security_settings (id) VALUES (1);

-- ADMIN ACTIONS
CREATE TABLE public.admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid,
  admin_email text,
  action text NOT NULL,
  target_user_id uuid,
  target_email text,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_actions TO authenticated;
GRANT ALL ON public.admin_actions TO service_role;
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_actions_admin_read" ON public.admin_actions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_auth_events_user ON public.auth_events (user_id, created_at DESC);
CREATE INDEX idx_auth_events_created ON public.auth_events (created_at DESC);
CREATE INDEX idx_login_attempts_email ON public.login_attempts (email, created_at DESC);

-- ============ DEMO SEED DATA ============
INSERT INTO public.profiles (id, email, full_name, department, job_title, mfa_enabled, is_locked, locked_at, security_score, last_login_at, is_demo)
SELECT
  gen_random_uuid(),
  lower(replace(n, ' ', '.')) || '@secureauth.io',
  n,
  d,
  jt,
  (i % 5) <> 0,
  (i % 11) = 0,
  CASE WHEN (i % 11) = 0 THEN now() - (i || ' hours')::interval ELSE NULL END,
  40 + ((i * 7) % 60),
  now() - ((i * 3) || ' hours')::interval,
  true
FROM (
  VALUES
    (1,'Amara Osei','Engineering','Platform Engineer'),
    (2,'Liam Novak','Engineering','Staff Engineer'),
    (3,'Priya Raman','Security','Security Analyst'),
    (4,'Diego Herrera','Security','SOC Lead'),
    (5,'Mei Tanaka','Finance','Financial Controller'),
    (6,'Noah Whitfield','Finance','Accountant'),
    (7,'Sofia Marchetti','People Ops','HR Business Partner'),
    (8,'Kwame Boateng','People Ops','Recruiter'),
    (9,'Elena Petrova','Engineering','SRE'),
    (10,'Jonas Berg','IT','Helpdesk Technician'),
    (11,'Aisha Rahman','IT','Systems Administrator'),
    (12,'Tomas Silva','Sales','Account Executive'),
    (13,'Hannah Kim','Sales','Sales Engineer'),
    (14,'Marcus Bell','Legal','Compliance Officer'),
    (15,'Yuki Nakamura','Legal','Counsel'),
    (16,'Olivia Grant','Marketing','Brand Manager'),
    (17,'Rafael Costa','Marketing','Growth Lead'),
    (18,'Ingrid Larsen','Engineering','Frontend Engineer'),
    (19,'Samuel Adeyemi','Security','Threat Researcher'),
    (20,'Chloe Dubois','Support','Support Lead'),
    (21,'Viktor Ilic','Support','Support Specialist'),
    (22,'Nadia Haddad','Data','Data Engineer'),
    (23,'Peter Zhang','Data','Analytics Lead'),
    (24,'Grace Mwangi','Executive','Chief Information Officer')
) AS t(i, n, d, jt);

-- 90 days of auth events for demo users
INSERT INTO public.auth_events (user_id, email, event_type, success, ip_address, user_agent, device, location, detail, created_at)
SELECT
  p.id,
  p.email,
  (ARRAY['password_login','mfa_challenge','mfa_challenge','password_login','session_refresh','password_change','backup_code_used'])[1 + ((g + abs(hashtext(p.email::text))) % 7)],
  ((g + abs(hashtext(p.email::text))) % 9) <> 0,
  '203.0.' || ((abs(hashtext(p.email::text)) + g) % 250) || '.' || ((g * 13) % 250),
  (ARRAY['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)','Mozilla/5.0 (Windows NT 10.0; Win64; x64)','Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)','Mozilla/5.0 (X11; Linux x86_64)'])[1 + (g % 4)],
  (ARRAY['MacBook Pro','Windows Desktop','iPhone 15','Linux Workstation','Pixel 8'])[1 + ((g + 2) % 5)],
  (ARRAY['Nairobi, KE','London, UK','Berlin, DE','Austin, US','Singapore, SG','Toronto, CA'])[1 + ((g + 1) % 6)],
  NULL,
  now() - ((g * 7 + (abs(hashtext(p.email::text)) % 11)) || ' hours')::interval
FROM public.profiles p
CROSS JOIN generate_series(1, 22) AS g
WHERE p.is_demo;

INSERT INTO public.login_attempts (email, ip_address, success, reason, created_at)
SELECT
  p.email,
  '198.51.100.' || ((g * 17) % 250),
  (g % 4) <> 0,
  CASE WHEN (g % 4) = 0 THEN (ARRAY['invalid_password','invalid_totp','account_locked'])[1 + (g % 3)] ELSE NULL END,
  now() - ((g * 5 + (abs(hashtext(p.email::text)) % 7)) || ' hours')::interval
FROM public.profiles p
CROSS JOIN generate_series(1, 8) AS g
WHERE p.is_demo;

INSERT INTO public.admin_actions (admin_email, action, target_user_id, target_email, details, created_at)
SELECT
  'grace.mwangi@secureauth.io',
  (ARRAY['unlock_account','reset_mfa','regenerate_backup_codes','policy_update','force_password_reset'])[1 + (g % 5)],
  p.id,
  p.email,
  (ARRAY['Verified identity over video call','Device lost, factor removed','User requested new recovery codes','Lockout threshold changed to 5','Password expired per policy'])[1 + (g % 5)],
  now() - ((g * 19) || ' hours')::interval
FROM public.profiles p
CROSS JOIN generate_series(1, 2) AS g
WHERE p.is_demo AND p.department IN ('Finance','IT','Support');
