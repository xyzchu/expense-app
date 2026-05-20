-- Gmail/Ollama local-worker review queue.
CREATE TABLE IF NOT EXISTS mail_candidates (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_message_id text        NOT NULL,
  gmail_thread_id  text,
  candidate_key    text        NOT NULL,
  kind             text        NOT NULL CHECK (kind IN ('expense', 'income', 'security')),
  status           text        NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'added', 'dismissed')),
  confidence       numeric     NOT NULL DEFAULT 0.75,
  reason           text        NOT NULL DEFAULT '',
  email_subject    text        NOT NULL DEFAULT '',
  email_from       text        NOT NULL DEFAULT '',
  email_date       text        NOT NULL DEFAULT '',
  email_snippet    text        NOT NULL DEFAULT '',
  payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  added_target_id  uuid,
  added_target     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, candidate_key)
);

CREATE TABLE IF NOT EXISTS mail_processed_messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_message_id text        NOT NULL,
  gmail_thread_id  text,
  email_subject    text        NOT NULL DEFAULT '',
  processed_at     timestamptz NOT NULL DEFAULT now(),
  item_count       integer     NOT NULL DEFAULT 0,
  UNIQUE (user_id, gmail_message_id)
);

ALTER TABLE mail_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_processed_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own mail candidates"
  ON mail_candidates FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "users read own processed mail"
  ON mail_processed_messages FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_mail_candidates_user_status_created
  ON mail_candidates (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mail_processed_user_processed
  ON mail_processed_messages (user_id, processed_at DESC);
