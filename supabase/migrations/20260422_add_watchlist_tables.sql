-- Watchlists (named groups)
CREATE TABLE IF NOT EXISTS watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watchlists_own" ON watchlists FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Watchlist items — one ticker can be in multiple watchlists
CREATE TABLE IF NOT EXISTS watchlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id uuid NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(watchlist_id, ticker)
);
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watchlist_items_own" ON watchlist_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Saved price snapshots (paper trading reference points)
CREATE TABLE IF NOT EXISTS watchlist_price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  price numeric NOT NULL,
  saved_at timestamptz DEFAULT now()
);
ALTER TABLE watchlist_price_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watchlist_snapshots_own" ON watchlist_price_snapshots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
