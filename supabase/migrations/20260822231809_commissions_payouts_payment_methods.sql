-- 1. Snapshot de comisión en órdenes (tarifa congelada al momento de la venta)
alter table public.orders
  add column commission_rate numeric(10,4) not null default 0.1000,
  add column platform_fee numeric(12,2) not null default 0,
  add column net_amount numeric(12,2) not null default 0,
  add column payout_id uuid;

-- 2. Devengo: al completarse una orden, el neto suma al balance del negocio.
--    Raíz única: cubre validate_pickup_code (móvil) y la API.
create or replace function public.accrue_order_earnings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    update public.businesses
    set balance = balance + new.net_amount
    where id = new.business_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_accrue_order_earnings on public.orders;
create trigger trg_accrue_order_earnings
  after update of status on public.orders
  for each row
  execute function public.accrue_order_earnings();

-- 3. Cortes quincenales: agrupa órdenes completadas sin payout por negocio.
create or replace function public.generate_payouts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_payout_id uuid;
  v_count int := 0;
begin
  for v_business in
    select business_id,
           sum(price) as gross,
           sum(platform_fee) as fee,
           sum(net_amount) as net,
           min(created_at)::date as period_start
    from public.orders
    where status = 'completed'
      and payout_id is null
    group by business_id
  loop
    insert into public.payouts
      (business_id, period_start, period_end, gross_amount, platform_fee, net_amount, status)
    values
      (v_business.business_id, v_business.period_start, current_date, v_business.gross, v_business.fee, v_business.net, 'pending')
    returning id into v_payout_id;

    update public.orders
    set payout_id = v_payout_id
    where business_id = v_business.business_id
      and status = 'completed'
      and payout_id is null;

    -- El balance se recalcula por construcción (no a ciegas): lo pendiente de corte.
    update public.businesses b
    set balance = coalesce((
      select sum(o.net_amount)
      from public.orders o
      where o.business_id = b.id
        and o.status = 'completed'
        and o.payout_id is null
    ), 0)
    where b.id = v_business.business_id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ponytail: generate_payouts sin lock concurrente — un solo caller (cron/admin);
-- usar advisory lock si algún día hay múltiples instancias disparándolo.

create extension if not exists pg_cron;
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'generate-payouts') then
    perform cron.unschedule('generate-payouts');
  end if;
  perform cron.schedule('generate-payouts', '0 3 1,16 * *', 'select public.generate_payouts()');
end;
$do$;

-- 4. Métodos de pago tokenizados (PCI: jamás PAN/CVV, solo token + metadatos de visualización)
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gateway payment_gateway not null default 'place_to_pay',
  gateway_token text not null,
  brand text not null,
  last4 text not null check (char_length(last4) = 4),
  exp_month int not null check (exp_month between 1 and 12),
  exp_year int not null,
  holder_name text not null,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.payment_methods enable row level security;

create policy "Users manage own payment methods"
  on public.payment_methods for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 5. Moneda operativa: USD (Ecuador)
alter table public.businesses add column currency text not null default 'USD';
alter table public.payment_intents alter column currency set default 'USD';
update public.payment_intents set currency = 'USD' where currency = 'COP';