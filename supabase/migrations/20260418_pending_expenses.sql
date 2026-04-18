-- pending_expenses: stores expense data received from the MacroDroid
-- webhook that is awaiting user confirmation before being inserted
-- into the main expenses table.
--
-- Run this in the Supabase dashboard SQL editor.

CREATE TABLE IF NOT EXISTS pending_expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID NOT NULL REFERENCES expense_lists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT,
  paid_by TEXT,
  split INT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pending_expenses_user_list_idx
  ON pending_expenses (user_id, list_id, created_at DESC);

ALTER TABLE pending_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pending"
  ON pending_expenses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pending"
  ON pending_expenses FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime for the pending_expenses table so the app receives
-- live updates when MacroDroid posts a new pending item.
ALTER PUBLICATION supabase_realtime ADD TABLE pending_expenses;
