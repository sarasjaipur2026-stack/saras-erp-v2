-- Keep dashboard_stats compatible with upgraded databases that use the
-- delivery_date_1/2/3 order columns and do not have the older delivery_date.

begin;

create or replace function public.dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_status_counts jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if public.has_permission('orders', 'view') then
    select jsonb_build_object(
      'total_orders', count(*),
      'pending_orders', count(*) filter (
        where status in ('draft', 'booking', 'approved', 'production', 'qc')
      ),
      'urgent_orders', count(*) filter (
        where priority = 'urgent' and status not in ('completed', 'cancelled')
      ),
      'total_revenue', coalesce(sum(grand_total) filter (where status <> 'cancelled'), 0),
      'outstanding_balance', coalesce(sum(balance_due) filter (where status <> 'cancelled'), 0),
      'overdue_count', count(*) filter (
        where coalesce(payment_due_date, delivery_date_1) < current_date
          and balance_due > 0
          and status not in ('completed', 'cancelled')
      )
    )
    into v_result
    from public.orders;

    select coalesce(jsonb_object_agg(status, count), '{}'::jsonb)
    into v_status_counts
    from (
      select status, count(*)::integer as count
      from public.orders
      group by status
    ) status_totals;
  else
    v_result := jsonb_build_object(
      'total_orders', 0,
      'pending_orders', 0,
      'urgent_orders', 0,
      'total_revenue', 0,
      'outstanding_balance', 0,
      'overdue_count', 0
    );
  end if;

  v_result := v_result || jsonb_build_object(
    'status_counts', v_status_counts,
    'new_enquiries', case
      when public.has_permission('enquiries', 'view')
      then (select count(*) from public.enquiries where outcome = 'open')
      else 0
    end,
    'total_customers', case
      when public.has_permission('masters', 'view')
      then (select count(*) from public.customers)
      else 0
    end,
    'total_payments', case
      when public.has_permission('payments', 'view')
      then (select coalesce(sum(amount), 0) from public.payments)
      else 0
    end
  );

  return v_result;
end
$$;

revoke all on function public.dashboard_stats() from public, anon;
grant execute on function public.dashboard_stats() to authenticated;

commit;
