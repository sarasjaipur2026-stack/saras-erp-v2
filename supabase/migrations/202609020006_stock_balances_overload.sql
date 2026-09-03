-- Keep the legacy boolean stock query without making a zero-argument RPC call
-- ambiguous with the audited JSONB stock_balances() endpoint.

begin;

do $$
begin
  -- The legacy overload exists only on upgraded databases. Keep it callable
  -- with an explicit boolean argument, but remove its default argument.
  if to_regprocedure('public.stock_balances(boolean)') is not null then
    -- PostgreSQL cannot remove an argument default with CREATE OR REPLACE.
    -- Recreate this overload in the same transaction so callers never observe
    -- a missing compatibility function.
    drop function public.stock_balances(boolean);

    execute $legacy$
      create function public.stock_balances(p_include_customer_owned boolean)
      returns table(
        key text,
        product_id uuid,
        material_id uuid,
        yarn_type_id uuid,
        product_type_id uuid,
        warehouse_id uuid,
        customer_owned boolean,
        product_name text,
        material_name text,
        warehouse_name text,
        is_finished_good boolean,
        unit text,
        quantity numeric,
        last_move timestamptz
      )
      language sql
      stable
      set search_path = pg_catalog, public
      as $function$
        select
          concat_ws(
            '|',
            b.product_id_key,
            b.material_id_key,
            b.yarn_type_id_key,
            b.product_type_id_key,
            b.warehouse_id_key
          ) as key,
          b.product_id,
          b.material_id,
          b.yarn_type_id,
          b.product_type_id,
          b.warehouse_id,
          b.customer_owned,
          coalesce(p.name, pt.name, m.name, yt.name) as product_name,
          coalesce(m.name, yt.name) as material_name,
          w.name as warehouse_name,
          (b.product_id is not null or b.product_type_id is not null) as is_finished_good,
          b.unit,
          b.quantity,
          b.last_move
        from public.stock_balances_v b
        left join public.products p on p.id = b.product_id
        left join public.materials m on m.id = b.material_id
        left join public.yarn_types yt on yt.id = b.yarn_type_id
        left join public.product_types pt on pt.id = b.product_type_id
        left join public.warehouses w on w.id = b.warehouse_id
        where p_include_customer_owned or b.customer_owned = false
      $function$
    $legacy$;

    revoke all on function public.stock_balances(boolean) from public, anon;
    grant execute on function public.stock_balances(boolean) to authenticated;
  end if;
end
$$;

commit;
