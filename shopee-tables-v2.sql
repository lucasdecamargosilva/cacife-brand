-- Enriquecimento Shopee v2: repasse/taxas + itens + devoluções. Seguro rodar de novo.

alter table public.shopee_orders
  add column if not exists payment_method  text,
  add column if not exists shipping_carrier text,
  add column if not exists shipping_fee     numeric,
  add column if not exists region           text,
  add column if not exists cancel_reason    text,
  add column if not exists buyer_paid       numeric,   -- quanto o comprador pagou
  add column if not exists escrow_amount    numeric,   -- repasse real ao lojista
  add column if not exists commission_fee   numeric,
  add column if not exists service_fee       numeric,
  add column if not exists transaction_fee  numeric,
  add column if not exists seller_voucher   numeric,   -- desconto bancado pelo lojista
  add column if not exists shopee_voucher   numeric,   -- desconto bancado pela Shopee
  add column if not exists income_synced    boolean default false;

create table if not exists public.shopee_order_items (
  shop_id       bigint not null,
  id_pedido     text   not null,
  order_item_id bigint not null,
  item_id       bigint,
  item_name     text,
  model_sku     text,
  qty           integer,
  price         numeric,
  primary key (shop_id, id_pedido, order_item_id)
);
create index if not exists shopee_items_item_idx on public.shopee_order_items (item_id);

create table if not exists public.shopee_returns (
  shop_id       bigint not null,
  return_sn     text   not null,
  order_sn      text,
  status        text,
  reason        text,
  refund_amount numeric,
  currency      text,
  created_at    timestamptz,
  primary key (shop_id, return_sn)
);

alter table public.shopee_order_items enable row level security;
alter table public.shopee_returns     enable row level security;
