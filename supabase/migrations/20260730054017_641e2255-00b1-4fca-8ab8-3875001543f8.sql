CREATE TABLE public.wiz_findings_seen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id text NOT NULL UNIQUE,
  severity text,
  title text,
  status text,
  entity_name text,
  url text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

CREATE INDEX wiz_findings_seen_first_seen_idx ON public.wiz_findings_seen (first_seen_at DESC);

GRANT ALL ON public.wiz_findings_seen TO service_role;

ALTER TABLE public.wiz_findings_seen ENABLE ROW LEVEL SECURITY;