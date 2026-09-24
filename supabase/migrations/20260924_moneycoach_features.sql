-- Aplicada el 2026-09-24 en el proyecto finanzas-app (Supabase)
-- Pagos / suscripciones
alter table public.recurring_transactions
  add column if not exists icon text, add column if not exists color text,
  add column if not exists kind text not null default 'bill', add column if not exists remind_days int not null default 1,
  add column if not exists end_date date, add column if not exists pay_url text,
  add column if not exists last_paid_on date, add column if not exists amount_variable boolean not null default false;
-- Hogar: calendario, día de cobro, límite diario
alter table public.households add column if not exists calendar_token text, add column if not exists payday int, add column if not exists daily_limit numeric;
update public.households set calendar_token = encode(extensions.gen_random_bytes(16), 'hex') where calendar_token is null;
alter table public.households alter column calendar_token set default encode(extensions.gen_random_bytes(16), 'hex');
create unique index if not exists households_calendar_token_key on public.households(calendar_token);
-- Cuentas: tarjetas y grupos
alter table public.accounts add column if not exists statement_day int, add column if not exists due_day int, add column if not exists group_name text, add column if not exists sort int not null default 0;
-- Metas
alter table public.goals add column if not exists image text, add column if not exists note text, add column if not exists archived boolean not null default false, add column if not exists completed_at timestamptz;
create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade, amount numeric not null default 0,
  contributed_on date not null default current_date, note text, created_by uuid references auth.users(id), created_at timestamptz default now());
alter table public.goal_contributions enable row level security;
create policy "hh goal_contributions" on public.goal_contributions for all using (household_id in (select user_households())) with check (household_id in (select user_households()));
-- Presupuestos: recargas y traspasos
create table if not exists public.budget_adjustments (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade, month date not null, amount numeric not null default 0, note text, created_at timestamptz default now());
alter table public.budget_adjustments enable row level security;
create policy "hh budget_adjustments" on public.budget_adjustments for all using (household_id in (select user_households())) with check (household_id in (select user_households()));
-- Movimientos: etiquetas, adjunto, ubicación
alter table public.transactions add column if not exists tags text[] not null default '{}', add column if not exists attachment_path text, add column if not exists location text;
-- Adjuntos en Storage privado (carpeta = id del hogar)
insert into storage.buckets (id, name, public) values ('adjuntos', 'adjuntos', false) on conflict (id) do nothing;
create policy "adjuntos hh select" on storage.objects for select to authenticated using (bucket_id = 'adjuntos' and (storage.foldername(name))[1]::uuid in (select user_households()));
create policy "adjuntos hh insert" on storage.objects for insert to authenticated with check (bucket_id = 'adjuntos' and (storage.foldername(name))[1]::uuid in (select user_households()));
create policy "adjuntos hh delete" on storage.objects for delete to authenticated using (bucket_id = 'adjuntos' and (storage.foldername(name))[1]::uuid in (select user_households()));
insert into public.app_config (k, v) values ('cron_secret', encode(extensions.gen_random_bytes(18), 'hex')) on conflict (k) do nothing;

-- Recordatorio diario 8:00 (Asunción) → edge function "recordatorios"
create extension if not exists pg_cron;
select cron.schedule('recordatorios-pagos', '0 11 * * *', $$ select net.http_post(
  url := 'https://yvivibcczpirjzipuiqb.supabase.co/functions/v1/recordatorios',
  headers := '{"Content-Type": "application/json"}'::jsonb,
  body := jsonb_build_object('secret', (select v from public.app_config where k = 'cron_secret'))); $$);
