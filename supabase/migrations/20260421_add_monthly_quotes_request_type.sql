alter table public.futu_refresh_requests
  drop constraint if exists futu_refresh_requests_request_type_check;

alter table public.futu_refresh_requests
  add constraint futu_refresh_requests_request_type_check
  check (request_type in ('transactions', 'prices', 'summary', 'full_sync', 'monthly_quotes'));
