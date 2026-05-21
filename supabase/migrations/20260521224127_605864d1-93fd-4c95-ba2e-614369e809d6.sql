CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
SELECT cron.schedule(
  'run-batch-schedules',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--dd72d617-205d-4bf8-8c8a-ab811effecb5.lovable.app/api/public/hooks/run-schedules',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);