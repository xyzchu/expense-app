-- User-defined custom news query topics
CREATE TABLE IF NOT EXISTS news_custom_queries (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_text  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE news_custom_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own custom queries"
  ON news_custom_queries FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Results for custom query fetches (one row per query per day)
CREATE TABLE IF NOT EXISTS custom_news_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_id    uuid        NOT NULL REFERENCES news_custom_queries(id) ON DELETE CASCADE,
  fetch_date  date        NOT NULL,
  headline    text        NOT NULL DEFAULT '',
  summary     text        NOT NULL DEFAULT '',
  is_read     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, query_id, fetch_date)
);

ALTER TABLE custom_news_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own custom news items"
  ON custom_news_items FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_custom_news_user_date
  ON custom_news_items (user_id, fetch_date DESC);
