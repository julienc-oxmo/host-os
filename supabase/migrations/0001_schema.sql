-- Host OS — schéma initial
-- Tables demandées dans le cahier des charges + quelques colonnes/tables additives
-- (marquées "additif") nécessaires à l'architecture multi-sources et multi-devises.

create extension if not exists "pgcrypto";

-- ───────────────────────── profiles ─────────────────────────
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text,
  display_name   text,
  main_currency  text not null default 'EUR' check (main_currency in ('EUR','MXN','USD')),
  settings       jsonb not null default '{}'::jsonb,   -- additif : ADR de référence, fenêtre de projection…
  created_at     timestamptz not null default now()
);

-- ───────────────────────── properties ─────────────────────────
create table if not exists public.properties (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  name               text not null,
  city               text,
  country            text,
  currency           text not null default 'EUR' check (currency in ('EUR','MXN','USD')),
  address            text,
  bedrooms           int  not null default 1,
  capacity           int  not null default 2,
  image_url          text,
  airbnb_listing_id  text,
  ical_url           text,
  active             boolean not null default true,
  listed_since       date,                                -- additif : début de disponibilité (évite de compter des nuits avant la mise en ligne)
  created_at         timestamptz not null default now()
);
create index if not exists properties_user_idx on public.properties(user_id);

-- ───────────────────────── reservations ─────────────────────────
create table if not exists public.reservations (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references public.properties(id) on delete cascade,
  external_id    text,                                    -- identifiant source (code Airbnb, id PMS…) → dédoublonnage
  guest_name     text,
  booking_date   date,
  check_in       date not null,
  check_out      date not null,
  nights         int  not null generated always as (check_out - check_in) stored,
  gross_revenue  numeric(14,2) not null default 0,
  platform_fee   numeric(14,2) not null default 0,
  net_revenue    numeric(14,2) not null default 0,
  currency       text not null default 'EUR',
  channel        text not null default 'airbnb',
  status         text not null default 'confirmed' check (status in ('confirmed','completed','cancelled','pending')),
  source         text not null default 'manual',          -- additif : csv / ical / api / pms
  created_at     timestamptz not null default now(),
  constraint reservations_dates_chk check (check_out > check_in)
);
create unique index if not exists reservations_external_uidx
  on public.reservations(property_id, external_id) where external_id is not null;
create index if not exists reservations_property_dates_idx on public.reservations(property_id, check_in, check_out);

-- ───────────────────────── expenses ─────────────────────────
create table if not exists public.expenses (
  id                    uuid primary key default gen_random_uuid(),
  property_id           uuid not null references public.properties(id) on delete cascade,
  category              text not null check (category in
    ('cleaning','maintenance','furniture','insurance','internet','electricity','condo','taxes','supplies','other')),
  amount                numeric(14,2) not null check (amount >= 0),
  currency              text not null default 'EUR',
  date                  date not null,
  description           text,
  recurring             boolean not null default false,
  recurrence_interval   text check (recurrence_interval in ('monthly','quarterly','yearly')),  -- additif
  recurrence_end        date,                                                                   -- additif
  created_at            timestamptz not null default now()
);
create index if not exists expenses_property_date_idx on public.expenses(property_id, date);

-- ───────────────────────── calendar_events (iCal / blocages) ─────────────────────────
create table if not exists public.calendar_events (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  external_id  text,
  start_date   date not null,
  end_date     date not null,                              -- exclusive (jour de départ)
  event_type   text not null default 'blocked' check (event_type in ('reserved','blocked','available')),
  source       text not null default 'manual',             -- manual / airbnb_ical / ical / pms
  created_at   timestamptz not null default now(),
  constraint calendar_events_dates_chk check (end_date > start_date)
);
create unique index if not exists calendar_events_external_uidx
  on public.calendar_events(property_id, source, external_id) where external_id is not null;

-- additif : plusieurs calendriers iCal par logement (Airbnb + autres)
create table if not exists public.property_calendars (
  id               uuid primary key default gen_random_uuid(),
  property_id      uuid not null references public.properties(id) on delete cascade,
  label            text not null,
  url              text not null,
  source           text not null default 'ical',           -- airbnb_ical / ical
  last_synced_at   timestamptz,
  last_status      text,
  created_at       timestamptz not null default now()
);

-- ───────────────────────── imports ─────────────────────────
create table if not exists public.imports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  filename       text,
  source         text not null default 'airbnb_csv',
  rows_imported  int not null default 0,
  duplicates     int not null default 0,
  imported_at    timestamptz not null default now()
);

-- ───────────────────────── property_targets ─────────────────────────
create table if not exists public.property_targets (
  id                       uuid primary key default gen_random_uuid(),
  property_id              uuid not null unique references public.properties(id) on delete cascade,
  monthly_revenue_target   numeric(14,2),
  occupancy_target         numeric(5,2),
  adr_target               numeric(14,2)
);

-- ───────────────────────── alerts ─────────────────────────
create table if not exists public.alerts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,   -- additif : alertes portfolio (sans logement)
  property_id  uuid references public.properties(id) on delete cascade,
  type         text not null,
  severity     text not null check (severity in ('info','watch','important')),
  message      text not null,
  dedupe_key   text,                                                -- additif : évite les doublons à chaque recalcul
  created_at   timestamptz not null default now(),
  read         boolean not null default false
);
create unique index if not exists alerts_dedupe_uidx on public.alerts(user_id, dedupe_key) where dedupe_key is not null;

-- ───────────────────────── fx_rates (additif) ─────────────────────────
-- Aucun taux n'est inventé : ils sont saisis par l'utilisateur ou alimentés plus tard
-- par un fournisseur externe (source = 'ecb', 'openexchangerates', …).
create table if not exists public.fx_rates (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  base      text not null,
  quote     text not null,
  rate      numeric(18,8) not null check (rate > 0),
  as_of     date not null default current_date,
  source    text not null default 'manual',
  unique (user_id, base, quote)
);

-- ───────────────────────── RLS ─────────────────────────
alter table public.profiles           enable row level security;
alter table public.properties         enable row level security;
alter table public.reservations       enable row level security;
alter table public.expenses           enable row level security;
alter table public.calendar_events    enable row level security;
alter table public.property_calendars enable row level security;
alter table public.imports            enable row level security;
alter table public.property_targets   enable row level security;
alter table public.alerts             enable row level security;
alter table public.fx_rates           enable row level security;

create policy "own profile"    on public.profiles   for all using (id = auth.uid())      with check (id = auth.uid());
create policy "own properties" on public.properties for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own imports"    on public.imports    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own fx"         on public.fx_rates   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own alerts"     on public.alerts     for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tables enfants : accès via la propriété du logement
create or replace function public.owns_property(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.properties p where p.id = pid and p.user_id = auth.uid());
$$;

create policy "own reservations"  on public.reservations       for all using (public.owns_property(property_id)) with check (public.owns_property(property_id));
create policy "own expenses"      on public.expenses           for all using (public.owns_property(property_id)) with check (public.owns_property(property_id));
create policy "own cal events"    on public.calendar_events    for all using (public.owns_property(property_id)) with check (public.owns_property(property_id));
create policy "own calendars"     on public.property_calendars for all using (public.owns_property(property_id)) with check (public.owns_property(property_id));
create policy "own targets"       on public.property_targets   for all using (public.owns_property(property_id)) with check (public.owns_property(property_id));

-- ───────────────────────── Profil créé automatiquement à l'inscription ─────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
