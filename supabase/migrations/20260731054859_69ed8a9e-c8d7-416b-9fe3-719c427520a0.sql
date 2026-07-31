CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'wiz-findings-slack-alerts',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--af181b62-bb3b-436a-a535-21fb832b11aa.lovable.app/api/public/wiz-poll',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_mdeFO5jPVcnUihQ0WIFsDQ_uk0TLOSZ"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);