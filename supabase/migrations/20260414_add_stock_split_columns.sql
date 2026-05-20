alter table public.securities_transactions
add column if not exists original_quantity numeric,
add column if not exists stock_split numeric not null default 1;

update public.securities_transactions
set
  original_quantity = coalesce(original_quantity, quantity),
  stock_split = coalesce(nullif(stock_split, 0), 1)
where original_quantity is null
   or stock_split is null
   or stock_split = 0;
