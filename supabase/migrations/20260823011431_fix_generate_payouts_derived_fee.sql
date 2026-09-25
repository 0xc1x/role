-- Corrige generate_payouts: deriva fee/net para órdenes legacy (fee=0) y asegura net = gross - fee
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
  v_gross numeric(12,2);
  v_fee numeric(12,2);
  v_net numeric(12,2);
begin
  for v_business in
    select
      business_id,
      sum(price) as gross,
      -- deriva fee si platform_fee es 0 por legacy: round(price * commission_rate)
      sum(case when platform_fee = 0 and commission_rate > 0 then round(price * commission_rate, 2) else platform_fee end) as fee,
      min(created_at)::date as period_start
    from public.orders
    where status = 'completed'
      and payout_id is null
    group by business_id
  loop
    v_gross := v_business.gross;
    v_fee := v_business.fee;
    v_net := v_gross - v_fee;

    insert into public.payouts
      (business_id, period_start, period_end, gross_amount, platform_fee, net_amount, status)
    values
      (v_business.business_id, v_business.period_start, current_date, v_gross, v_fee, v_net, 'pending')
    returning id into v_payout_id;

    update public.orders
    set payout_id = v_payout_id,
        -- backfill legacy fee/net para consistencia futura
        platform_fee = case when platform_fee = 0 and commission_rate > 0 then round(price * commission_rate, 2) else platform_fee end,
        net_amount = price - case when platform_fee = 0 and commission_rate > 0 then round(price * commission_rate, 2) else platform_fee end
    where business_id = v_business.business_id
      and status = 'completed'
      and payout_id is null;

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

-- Backfill inmediato para órdenes completed legacy antes del próximo generate
update public.orders
set platform_fee = round(price * commission_rate, 2),
    net_amount = price - round(price * commission_rate, 2)
where status = 'completed'
  and payout_id is null
  and platform_fee = 0
  and commission_rate > 0;
