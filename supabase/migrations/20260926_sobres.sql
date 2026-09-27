-- Sobres: varias metas y proyectos comparten una misma cuenta (ej. el fondo mutuo).
-- Cada meta/proyecto vinculado avanza solo con lo que se le asigna (goal_contributions).
alter table public.goal_contributions alter column goal_id drop not null;
alter table public.goal_contributions
  add column if not exists trip_id uuid references public.trips(id) on delete cascade,
  add column if not exists account_id uuid references public.accounts(id) on delete set null,
  add column if not exists transaction_id uuid references public.transactions(id) on delete cascade,
  add column if not exists kind text not null default 'aporte';   -- aporte | retiro | interes | mover
do $$ begin
  alter table public.goal_contributions add constraint goal_contributions_un_destino
    check ((goal_id is not null)::int + (trip_id is not null)::int = 1);
exception when duplicate_object then null; end $$;
create index if not exists goal_contributions_trip_idx on public.goal_contributions(trip_id);
create index if not exists goal_contributions_tx_idx on public.goal_contributions(transaction_id);

-- Rendimientos: además de acreditar el interés, lo reparte entre los sobres de la cuenta
create or replace function public.acreditar_rendimientos() returns integer
language plpgsql security definer set search_path = public as $$
declare
  a record; s record;
  hoy date := (now() at time zone 'America/Asuncion')::date;
  due date; saldo numeric; dias int; monto numeric; cat uuid; tx uuid; parte numeric;
  n int := 0;
begin
  for a in select * from accounts
           where coalesce(interest_rate, 0) > 0 and not archived and interest_since is not null
  loop
    loop
      due := interest_date(a.interest_since, a.interest_day);
      if due <= a.interest_since then
        due := interest_date((a.interest_since + interval '1 month')::date, a.interest_day);
      end if;
      exit when due > hoy;

      select coalesce(balance, 0) into saldo from account_balances where account_id = a.id;
      dias := due - a.interest_since;
      monto := round(saldo * (power(1 + a.interest_rate / 100.0, dias / 365.0) - 1));

      if monto > 0 then
        select id into cat from categories
          where household_id = a.household_id and kind = 'income'
            and (name ilike '%rendim%' or name ilike '%inter%s%' or name ilike '%inversi%')
          order by created_at limit 1;
        insert into transactions (household_id, account_id, type, amount, currency, category_id,
                                  occurred_on, payee, note, source, auto)
        values (a.household_id, a.id, 'income', monto, coalesce(a.currency, 'PYG'), cat, due,
                'Rendimiento ' || a.name,
                replace(trim(to_char(a.interest_rate, 'FM990.99')), '.', ',') || '% anual · ' || dias || ' días',
                'interest', true)
        returning id into tx;
        n := n + 1;

        -- reparto proporcional a lo que tiene cada sobre (lo no asignado se queda su parte)
        if saldo > 0 then
          for s in
            select 'g' as k, g.id, coalesce(sum(c.amount), 0) as bal
              from goals g left join goal_contributions c on c.goal_id = g.id
              where g.account_id = a.id and not g.archived group by g.id
            union all
            select 't', t.id, coalesce(sum(c.amount), 0)
              from trips t left join goal_contributions c on c.trip_id = t.id
              where t.saved_account_id = a.id and not t.archived group by t.id
          loop
            if s.bal > 0 then
              parte := floor(monto * s.bal / saldo);
              if parte > 0 then
                insert into goal_contributions (household_id, goal_id, trip_id, amount, contributed_on,
                                                note, account_id, transaction_id, kind)
                values (a.household_id, case when s.k = 'g' then s.id end, case when s.k = 't' then s.id end,
                        parte, due, 'Rendimiento ' || a.name, a.id, tx, 'interes');
              end if;
            end if;
          end loop;
        end if;
      end if;

      update accounts set interest_since = due where id = a.id;
      a.interest_since := due;
    end loop;
  end loop;
  return n;
end $$;

revoke all on function public.acreditar_rendimientos() from public, anon, authenticated;
