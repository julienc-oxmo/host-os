# Host OS

Application web de pilotage de logements loués sur Airbnb : revenus, occupation, ADR, RevPAR, profit net, calendrier intelligent, *Revenue Opportunity*, insights, alertes, objectifs, prévisions, imports CSV / iCal.

**Stack** : React + TypeScript + Vite · Supabase (Postgres, Auth, RLS, Edge Functions). Aucune dépendance au scraping Airbnb.

## Démarrer

```bash
npm install
npm run dev          # sans configuration : mode démo local (données dans le navigateur)
```

### Avec Supabase
1. Créez un projet Supabase, puis appliquez `supabase/migrations/0001_schema.sql` (SQL editor ou `supabase db push`).
2. `cp .env.example .env` et renseignez `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
3. `npm run dev`, créez un compte, puis « Charger la démo » (ou `USER_ID=<uuid> npm run seed:sql > supabase/seed.sql`).
4. Edge Functions (optionnel) : `supabase functions deploy ical-sync ingest-reservations`.

Scripts : `npm test` (calculs, cohérence de la démo, import CSV, iCal) · `npm run typecheck` · `npm run build`.

## Architecture

```
src/lib/metrics.ts      moteur de calcul (occupation, ADR, RevPAR, profit, trous, opportunité, devises)
src/lib/insights.ts     insights : observation / hypothèse / action (jamais de cause inventée)
src/lib/alerts.ts       alertes Info / À surveiller / Important
src/lib/performance.ts  performance d'un logement vs son propre historique (5 signaux pondérés)
src/lib/forecast.ts     confirmé vs projection estimée (séparés)
src/lib/demo/           données de démo déterministes et cohérentes
src/data/               contrat Repo + SupabaseRepo + LocalRepo (même interface)
src/imports/            couche d'import indépendante de la source (NormalizedReservation)
supabase/               schéma + RLS, Edge Functions (ical-sync, ingest-reservations)
```

**Brancher une nouvelle source (PMS, API Airbnb…)** : écrire un adaptateur qui produit des `NormalizedReservation`, puis les passer à `planIngest` + `repo.ingestReservations` (ou POST sur l'Edge Function `ingest-reservations`). Le dédoublonnage repose sur l'index unique `(property_id, external_id)`.

## Règles de calcul
- Occupation = nuits réservées / nuits disponibles × 100 (nuits bloquées exclues ; nuits avant `listed_since` exclues).
- ADR = revenu hébergement **brut** / nuits vendues · RevPAR = brut / nuits disponibles · Profit = net − dépenses.
- Le revenu d'un séjour est réparti à parts égales sur ses nuits (séjours à cheval sur deux mois ventilés).
- Séjour moyen et lead time portent sur les séjours dont l'arrivée tombe dans la période. Les réservations « en attente » et annulées sont exclues.
- Revenue Opportunity = nuits disponibles non vendues × ADR de référence (30 j / 90 j / annuel) — toujours présentée comme une estimation.
- Multi-devises : chaque logement garde sa devise. La consolidation exige un taux saisi par l'utilisateur (`fx_rates`) ; **aucun taux n'est inventé** — sans taux, le logement est exclu des totaux et un bandeau l'indique.

## Utiliser avec un vrai logement
1. Paramètres → *Tout effacer* (ou démarrez vide), puis ajoutez le logement (nom, devise, prix d'achat, frais d'acquisition en %, ameublement).
2. Imports → déposez l'export Airbnb *Historique des transactions* (CSV) : les lignes sont regroupées par réservation (brut, frais de service, impôt retenu → dépense « Taxes »). Pour les séjours à venir, importez aussi l'export *Réservations*.
3. Fiche logement → *Rentabilité de l'investissement* : rendement, amortissement estimé et simulation.
> Ne commitez jamais vos exports CSV : ils contiennent les noms de vos voyageurs.
