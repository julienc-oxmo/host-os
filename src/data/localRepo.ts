import { generateDemo } from '../lib/demo/generate'
import { todayStr } from '../lib/dates'
import type { AlertRow, Dataset, Property } from '../lib/types'
import type { Repo } from './repository'

const KEY = 'hostos.local.v2'
const USER = 'local-user'
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2) + Date.now().toString(16))

const emptyDataset = (): Dataset => ({
  profile: { id: USER, email: null, display_name: 'Mode démo', main_currency: 'EUR', settings: {} },
  properties: [], reservations: [], expenses: [], calendarEvents: [], calendars: [], targets: [], alerts: [], imports: [], fxRates: [],
})

function seeded(): Dataset {
  const d = generateDemo({ userId: USER, today: todayStr() })
  return { ...emptyDataset(), ...d }
}

/** Même contrat que SupabaseRepo, persisté dans localStorage : permet de tester l'app sans backend. */
export function createLocalRepo(): Repo {
  let ds: Dataset
  try {
    const raw = localStorage.getItem(KEY)
    ds = raw ? (JSON.parse(raw) as Dataset) : emptyDataset()
  } catch {
    ds = emptyDataset()
  }
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(ds)) } catch { /* quota / navigation privée */ }
  }
  save()
  const clone = (): Dataset => JSON.parse(JSON.stringify(ds))

  return {
    mode: 'local',
    async load() { return clone() },
    async seedDemo() { ds = seeded(); save() },
    async clearAll() { ds = { ...emptyDataset(), profile: ds.profile }; save() },

    async saveProfile(patch) { ds.profile = { ...ds.profile, ...patch }; save() },
    async saveProperty(p) {
      if (p.id) {
        ds.properties = ds.properties.map((x) => (x.id === p.id ? { ...x, ...p } as Property : x))
        save()
        return ds.properties.find((x) => x.id === p.id)!
      }
      const row: Property = {
        id: uid(), user_id: USER, city: null, country: null, currency: 'EUR', address: null, bedrooms: 1, capacity: 2,
        image_url: null, airbnb_listing_id: null, ical_url: null, active: true, listed_since: null,
        purchase_price: null, purchase_costs: null, furnishing_cost: null, purchase_date: null,
        created_at: new Date().toISOString(), ...p,
      }
      ds.properties.push(row)
      save()
      return row
    },
    async deleteProperty(id) {
      ds.properties = ds.properties.filter((p) => p.id !== id)
      for (const k of ['reservations', 'expenses', 'calendarEvents', 'calendars', 'targets', 'alerts'] as const)
        (ds[k] as { property_id: string | null }[]) = (ds[k] as { property_id: string | null }[]).filter((r) => r.property_id !== id)
      save()
    },

    async addExpense(e) { ds.expenses.push({ ...e, id: uid() }); save() },
    async updateExpense(id, e) { ds.expenses = ds.expenses.map((x) => (x.id === id ? { ...x, ...e } : x)); save() },
    async deleteExpense(id) { ds.expenses = ds.expenses.filter((x) => x.id !== id); save() },

    async addReservation(r) {
      const nights = Math.round((Date.parse(r.check_out) - Date.parse(r.check_in)) / 86_400_000)
      ds.reservations.push({ ...r, id: uid(), nights })
      save()
    },
    async deleteReservation(id) { ds.reservations = ds.reservations.filter((x) => x.id !== id); save() },
    async ingestReservations(rows, meta) {
      const have = new Set(ds.reservations.map((r) => `${r.property_id}|${r.external_id}`))
      for (const { property_ref, tax_withheld, tax_date, ...r } of rows) {
        if (have.has(`${r.property_id}|${r.external_id}`)) continue
        if ((tax_withheld ?? 0) > 0)
          ds.expenses.push({ id: uid(), property_id: r.property_id, category: 'taxes', amount: tax_withheld!, currency: r.currency ?? 'EUR', date: tax_date ?? r.check_out, description: `Retenue d’impôt à la source (plateforme) — ${r.external_id}`, recurring: false, recurrence_interval: null, recurrence_end: null })
        const nights = Math.round((Date.parse(r.check_out) - Date.parse(r.check_in)) / 86_400_000)
        ds.reservations.push({ ...r, currency: r.currency ?? 'EUR', id: uid(), nights, source: meta.source })
      }
      ds.imports.push({ id: uid(), user_id: USER, filename: meta.filename, source: meta.source, rows_imported: rows.length, duplicates: meta.duplicates, imported_at: new Date().toISOString() })
      save()
    },

    async saveTarget(t) {
      const ex = ds.targets.find((x) => x.property_id === t.property_id)
      if (ex) Object.assign(ex, t)
      else ds.targets.push({ ...t, id: uid() })
      save()
    },

    async replaceCalendarEvents(propertyId, source, events) {
      ds.calendarEvents = ds.calendarEvents.filter((e) => !(e.property_id === propertyId && e.source === source))
      for (const e of events) ds.calendarEvents.push({ ...e, id: uid(), property_id: propertyId, source })
      save()
    },
    async addCalendar(c) { ds.calendars.push({ ...c, id: uid(), last_synced_at: null, last_status: null }); save() },
    async deleteCalendar(id) { ds.calendars = ds.calendars.filter((c) => c.id !== id); save() },
    async syncCalendars() {
      throw new Error('La synchronisation iCal par URL passe par l’Edge Function Supabase (indisponible en mode démo local). Importez un fichier .ics à la place.')
    },

    async setFxRate(base, quote, rate) {
      const ex = ds.fxRates.find((f) => f.base === base && f.quote === quote)
      if (ex) { ex.rate = rate; ex.as_of = todayStr() }
      else ds.fxRates.push({ id: uid(), user_id: USER, base, quote, rate, as_of: todayStr(), source: 'manual' })
      save()
    },
    async deleteFxRate(id) { ds.fxRates = ds.fxRates.filter((f) => f.id !== id); save() },

    async insertAlerts(alerts) {
      const have = new Set(ds.alerts.map((a) => a.dedupe_key))
      const added: AlertRow[] = []
      for (const a of alerts) {
        if (have.has(a.dedupe_key)) continue
        const row: AlertRow = { ...a, id: uid(), user_id: USER, created_at: new Date().toISOString(), read: false }
        ds.alerts.push(row)
        added.push(row)
      }
      save()
      return added
    },
    async markAlerts(ids, read) { ds.alerts = ds.alerts.map((a) => (ids.includes(a.id) ? { ...a, read } : a)); save() },
  }
}
