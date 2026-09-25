-- Optimización auth_rls_initplan: envuelve llamadas a auth.uid() /
-- auth_helpers.my_role() en subselects INITPLAN para que el planificador
-- las evalúe una vez por consulta en vez de una vez por fila.
-- Semánticamente idéntico (las funciones son STABLE).
do $$
declare
  r record;
  q text;
  w text;
  stmt text;
begin
  for r in
    select * from pg_policies
    where schemaname = 'public' and tablename <> 'app_config'
  loop
    q := coalesce(r.qual, '');
    w := coalesce(r.with_check, '');

    if q not like '%(select auth.uid())%' then
      q := replace(q, 'auth.uid()', '(select auth.uid())');
    end if;
    if w not like '%(select auth.uid())%' then
      w := replace(w, 'auth.uid()', '(select auth.uid())');
    end if;

    if q not like '%(select auth_helpers.my_role())%' then
      q := replace(q, 'auth_helpers.my_role()', '(select auth_helpers.my_role())');
    end if;
    if w not like '%(select auth_helpers.my_role())%' then
      w := replace(w, 'auth_helpers.my_role()', '(select auth_helpers.my_role())');
    end if;

    if q is distinct from coalesce(r.qual, '') or w is distinct from coalesce(r.with_check, '') then
      execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);

      stmt := format(
        'create policy %I on public.%I for %s to %s',
        r.policyname,
        r.tablename,
        r.cmd,
        (select string_agg(quote_ident(rol), ', ') from unnest(r.roles) as rol)
      );

      if coalesce(r.qual, '') <> '' and r.cmd <> 'INSERT' then
        stmt := stmt || format(' using (%s)', q);
      end if;
      if coalesce(r.with_check, '') <> '' and r.cmd in ('INSERT', 'UPDATE', 'ALL') then
        stmt := stmt || format(' with check (%s)', w);
      end if;

      raise notice 'recreando %.%', r.tablename, r.policyname;
      execute stmt;
    end if;
  end loop;
end $$;