-- Stock news items: AI-summarised news per user per ticker per day
CREATE TABLE IF NOT EXISTS stock_news_items (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker            text        NOT NULL,
  fetch_date        date        NOT NULL,
  headline          text        NOT NULL DEFAULT '',
  summary           text        NOT NULL DEFAULT '',
  price             numeric,
  price_change_pct  numeric,
  is_read           boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker, fetch_date)
);

ALTER TABLE stock_news_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own news items"
  ON stock_news_items FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_stock_news_user_date
  ON stock_news_items (user_id, fetch_date DESC);

-- User-level push subscriptions for news notifications (not tied to a list)
CREATE TABLE IF NOT EXISTS user_push_subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text        NOT NULL,
  p256dh      text        NOT NULL,
  auth_key    text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE user_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own push subscriptions"
  ON user_push_subscriptions FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── Schedule setup (run in Supabase SQL editor after deploying the edge function) ──
-- Runs every 15 minutes; the function checks each user's configured fetch time.
--
-- SELECT cron.schedule(
--   'fetch-stock-news',
--   '*/15 * * * *',
--   $$
--     SELECT net.http_post(
--       url     := 'YOUR_SUPABASE_URL/functions/v1/fetch-stock-news',
--       headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
--       body    := '{}'::jsonb
--     )
--   $$
-- );
