-- Cuentas que generan rendimiento (fondo mutuo, ahorro, CDA): se acredita solo cada mes.
alter table public.accounts
  add column if not exists interest_rate numeric,          -- % anual (tasa efectiva anual), ej 6.5
  add column if not exists interest_day integer,           -- día del mes en que se acredita (1-31)
  add column if not exists interest_since date;            -- desde cuándo corre el próximo rendimiento

-- Si se activa la tasa y no hay fecha de inicio, arranca hoy (hora Paraguay)
create or replace function public.accounts_interest_defaults() returns trigger
language plpgsql as $$
begin
  if coalesce(new.interest_rate, 0) > 0 then
    if new.interest_day is null then
      new.interest_day := extract(day from (now() at time zone 'America/Asuncion'))::int;
    end if;
    if new.interest_since is null
       or (tg_op = 'UPDATE' and coalesce(old.interest_rate, 0) <= 0) then
      new.interest_since := (now() at time zone 'America/Asuncion')::date;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_accounts_interest_defaults on public.accounts;
create trigger trg_accounts_interest_defaults before insert or update on public.accounts
  for each row execute function public.accounts_interest_defaults();

-- Fecha de acreditación de un mes dado (si el mes no tiene ese día, usa el último)
create or replace function public.interest_date(p_month date, p_day int) returns date
language sql immutable as $$
  select least(
    date_trunc('month', p_month)::date + (p_day - 1),
    (date_trunc('month', p_month) + interval '1 month - 1 day')::date
  )
$$;

-- Acredita los rendimientos vencidos. Corre todos los días por pg_cron.
create or replace function public.acreditar_rendimientos() returns integer
language plpgsql security definer set search_path = public as $$
declare
  a record;
  hoy date := (now() at time zone 'America/Asuncion')::date;
  due date;
  saldo numeric;
  dias int;
  monto numeric;
  cat uuid;
  n int := 0;
begin
  for a in select * from accounts
           where coalesce(interest_rate, 0) > 0 and not archived and interest_since is not null
  loop
    loop
      -- próxima fecha de acreditación estrictamente posterior a interest_since
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
                'interest', true);
        n := n + 1;
      end if;

      update accounts set interest_since = due where id = a.id;
      a.interest_since := due;
    end loop;
  end loop;
  return n;
end $$;

revoke all on function public.acreditar_rendimientos() from public, anon, authenticated;

-- Todos los días 11:50 hora Paraguay (14:50 UTC)
select cron.unschedule('rendimientos-cuentas') where exists (select 1 from cron.job where jobname = 'rendimientos-cuentas');
select cron.schedule('rendimientos-cuentas', '50 14 * * *', $$ select public.acreditar_rendimientos(); $$);
