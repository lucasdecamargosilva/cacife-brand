-- Tabelas da integração Shopee (loja real da Cacife).
-- Rodar no Supabase → SQL Editor. Seguro rodar de novo (IF NOT EXISTS).

create table if not exists public.shopee_tokens (
  shop_id            bigint primary key,
  access_token       text not null,
  refresh_token      text not null,
  expires_at         timestamptz not null,
  refresh_expires_at timestamptz not null,
  updated_at         timestamptz not null default now()
);

create table if not exists public.shopee_orders (
  shop_id        bigint not null,
  id_pedido      text   not null,
  channel        text,
  environment    text,
  currency       text,
  total          numeric,
  payment_status text,
  status         text,
  created_at     timestamptz,
  updated_at     timestamptz,
  paid_at        timestamptz,
  primary key (shop_id, id_pedido)
);

create index if not exists shopee_orders_paid_at_idx on public.shopee_orders (paid_at);
create index if not exists shopee_orders_status_idx  on public.shopee_orders (payment_status);

-- RLS ligada: só o service_role (usado pelo servidor) acessa. O anon não lê direto;
-- o painel lê via /api/shopee/orders no servidor.
alter table public.shopee_tokens enable row level security;
alter table public.shopee_orders enable row level security;
