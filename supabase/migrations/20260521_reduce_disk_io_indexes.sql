-- Reduce repeated sequential scans from app pages, local workers, and widgets.
-- These are safe additive indexes for the filters/orderings used most often.

create index if not exists financial_snapshots_user_date_idx
  on public.financial_snapshots (user_id, snapshot_date desc);

create index if not exists financial_snapshots_account_date_idx
  on public.financial_snapshots (account_id, snapshot_date desc);

create index if not exists financial_accounts_user_sort_idx
  on public.financial_accounts (user_id, sort_order);

create index if not exists financial_date_rates_user_date_idx
  on public.financial_date_rates (user_id, snapshot_date desc);

create index if not exists expenses_list_date_idx
  on public.expenses (list_id, date desc, created_at desc);

create index if not exists expenses_list_category_date_idx
  on public.expenses (list_id, category, date desc);

create index if not exists user_settings_key_user_idx
  on public.user_settings (key, user_id);

create index if not exists stock_news_unread_user_idx
  on public.stock_news_items (user_id, is_read)
  where headline <> '';

create index if not exists custom_news_unread_user_idx
  on public.custom_news_items (user_id, is_read)
  where headline <> '';

create index if not exists travel_bookings_trip_sort_idx
  on public.travel_bookings (trip_id, sort_order, start_date);

create index if not exists travel_trip_members_user_trip_idx
  on public.travel_trip_members (user_id, trip_id);

create index if not exists watchlist_items_user_idx
  on public.watchlist_items (user_id);

create index if not exists watchlist_price_snapshots_user_saved_idx
  on public.watchlist_price_snapshots (user_id, saved_at desc);
