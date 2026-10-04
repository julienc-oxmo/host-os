-- Coût de ménage appliqué automatiquement à chaque départ (additif)
alter table public.properties add column if not exists cleaning_cost numeric(14,2);
