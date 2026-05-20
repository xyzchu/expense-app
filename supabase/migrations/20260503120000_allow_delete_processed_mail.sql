DROP POLICY IF EXISTS "users delete own processed mail" ON mail_processed_messages;

CREATE POLICY "users delete own processed mail"
  ON mail_processed_messages FOR DELETE
  USING ((select auth.uid()) = user_id);
