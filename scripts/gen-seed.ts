// Génère supabase/seed.sql avec les données de démo pour un utilisateur existant.
//   USER_ID=<uuid auth.users> npm run seed:sql > supabase/seed.sql
// (L'app peut aussi charger la démo elle-même : bouton « Charger la démo ».)
import { generateDemo } from '../src/lib/demo/generate'
import { todayStr } from '../src/lib/dates'

const userId = process.env.USER_ID
if (!userId) { console.error('USER_ID manquant (uuid de auth.users).'); process.exit(1) }
const d = generateDemo({ userId, today: todayStr() })
const q = (v: unknown) => (v == null ? 'null' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
const insert = (table: string, cols: string[], rows: Record<string, unknown>[]) =>
  rows.length ? `insert into public.${table} (${cols.join(', ')}) values\n${rows.map((r) => `  (${cols.map((c) => q(r[c])).join(', ')})`).join(',\n')};\n` : ''

const out = [
  '-- Données de démonstration Host OS (générées par scripts/gen-seed.ts)',
  `-- Utilisateur : ${userId}`,
  'begin;',
  insert('properties', ['id', 'user_id', 'name', 'city', 'country', 'currency', 'address', 'bedrooms', 'capacity', 'image_url', 'active', 'listed_since'], d.properties as never),
  insert('property_targets', ['id', 'property_id', 'monthly_revenue_target', 'occupancy_target', 'adr_target'], d.targets as never),
  insert('calendar_events', ['id', 'property_id', 'start_date', 'end_date', 'event_type', 'source'], d.calendarEvents as never),
  // `nights` est une colonne générée : non insérée.
  insert('reservations', ['id', 'property_id', 'external_id', 'guest_name', 'booking_date', 'check_in', 'check_out', 'gross_revenue', 'platform_fee', 'net_revenue', 'currency', 'channel', 'status', 'source'], d.reservations as never),
  insert('expenses', ['id', 'property_id', 'category', 'amount', 'currency', 'date', 'description', 'recurring', 'recurrence_interval', 'recurrence_end'], d.expenses as never),
  'commit;',
]
console.log(out.join('\n'))
