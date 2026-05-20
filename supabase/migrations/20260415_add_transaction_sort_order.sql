alter table public.securities_transactions
add column if not exists sort_order bigint;

with ordered as (
  select
    id,
    row_number() over (
      partition by user_id
      order by transaction_date, created_at, id
    ) as seq
  from public.securities_transactions
  where sort_order is null
)
update public.securities_transactions t
set sort_order = ordered.seq
from ordered
where t.id = ordered.id;

create index if not exists securities_transactions_user_date_sort_idx
on public.securities_transactions (user_id, transaction_date, sort_order, created_at);
