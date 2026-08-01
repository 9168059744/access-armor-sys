-- wiz_findings_seen: admin read access, backend-only writes
GRANT SELECT ON public.wiz_findings_seen TO authenticated;
GRANT ALL ON public.wiz_findings_seen TO service_role;

DROP POLICY IF EXISTS wiz_findings_admin_read ON public.wiz_findings_seen;
CREATE POLICY wiz_findings_admin_read
  ON public.wiz_findings_seen
  FOR SELECT
  TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

-- login_attempts: writes are backend-only (service role); admins keep read access
REVOKE INSERT, UPDATE, DELETE ON public.login_attempts FROM authenticated, anon;
GRANT SELECT ON public.login_attempts TO authenticated;
GRANT ALL ON public.login_attempts TO service_role;