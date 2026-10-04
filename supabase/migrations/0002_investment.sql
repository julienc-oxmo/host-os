-- Rentabilité / amortissement de l'investissement (additif)
alter table public.properties
  add column if not exists purchase_price   numeric(16,2),   -- prix d'achat (devise du logement)
  add column if not exists purchase_costs   numeric(16,2),   -- frais d'acquisition (notaire, taxes…)
  add column if not exists furnishing_cost  numeric(16,2),   -- ameublement / équipement
  add column if not exists purchase_date    date;
