-- Serverless deployments have no pg-boss queue to keep one Hevy sync per user
-- running at a time, so a sync takes a short lease on its state row instead.
-- A crashed or timed-out run just lets the lease lapse.
alter table public.hevy_sync_state add column sync_lease_until timestamptz;
