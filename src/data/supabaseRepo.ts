import type { SupabaseClient } from '@supabase/supabase-js'
import { generateDemo } from '../lib/demo/generate'
import { todayStr } from '../lib/dates'
import type { AlertRow, Dataset, Profile } from '../lib/types'
import type { Repo } from './repository'

const CHUNK = 400

/** Supabase limite chaque requête à 1000 lignes : on pagine. */
async function fetchAll<T = unknown>(sb: SupabaseClient, table: string, order = 'created_at'): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select('*').order(order, { ascending: true }).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

const must = <T,>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message)
  return r.data
}

async function insertChunks(sb: SupabaseClient, table: string, rows: object[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb.from(table).insert(rows.slice(i, i + CHUNK))
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

export function createSupabaseRepo(sb: SupabaseClient, userId: string, email: string | null): Repo {
  return {
    mode: 'supabase',

    async load(): Promise<Dataset> {
      let profile = (await sb.from('profiles').select('*').eq('id', userId).maybeSingle()).data as Profile | null
      if (!profile) {
        // Le trigger SQL crée normalement le profil ; filet de sécurité si la migration est antérieure à l'inscription.
        const ins = await sb.from('profiles').insert({ id: userId, email, display_name: email?.split('@')[0] ?? null }).select().single()
        profile = must(ins) as Profile
      }
      const [properties, reservations, expenses, calendarEvents, calendars, targets, alerts, imports, fxRates] = await Promise.all([
        fetchAll(sb, 'properties'), fetchAll(sb, 'reservations', 'check_in'), fetchAll(sb, 'expenses', 'date'),
        fetchAll(sb, 'calendar_events', 'start_date'), fetchAll(sb, 'property_calendars'), fetchAll(sb, 'property_targets', 'id'),
        fetchAll(sb, 'alerts'), fetchAll(sb, 'imports', 'imported_at'), fetchAll(sb, 'fx_rates', 'as_of'),
      ])
      const num = (v: unknown) => (v == null ? v : Number(v))
      return {
        profile: { ...profile, settings: profile.settings ?? {} },
        properties: properties as Dataset['properties'], calendarEvents: calendarEvents as Dataset['calendarEvents'],
        calendars: calendars as Dataset['calendars'], imports: imports as Dataset['imports'], alerts: alerts as AlertRow[],
        reservations: (reservations as Dataset['reservations']).map((r) => ({
          ...r, gross_revenue: Number(r.gross_revenue), platform_fee: Number(r.platform_fee), net_revenue: Number(r.net_revenue),
        })),
        expenses: (expenses as Dataset['expenses']).map((e) => ({ ...e, amount: Number(e.amount) })),
        targets: (targets as Dataset['targets']).map((t) => ({
          ...t, monthly_revenue_target: num(t.monthly_revenue_target) as number | null,
          occupancy_target: num(t.occupancy_target) as number | null, adr_target: num(t.adr_target) as number | null,
        })),
        fxRates: (fxRates as Dataset['fxRates']).map((f) => ({ ...f, rate: Number(f.rate) })),
      }
    },

    async seedDemo() {
      const d = generateDemo({ userId, today: todayStr() })
      await insertChunks(sb, 'properties', d.properties)
      await insertChunks(sb, 'property_targets', d.targets)
      await insertChunks(sb, 'calendar_events', d.calendarEvents)
      // `nights` est une colonne générée côté base : on ne l'envoie pas.
      await insertChunks(sb, 'reservations', d.reservations.map(({ nights, created_at, ...r }) => r))
      await insertChunks(sb, 'expenses', d.expenses.map(({ created_at, ...e }) => e))
    },

    async clearAll() {
      must(await sb.from('properties').delete().eq('user_id', userId)) // cascade sur tout le reste
      must(await sb.from('imports').delete().eq('user_id', userId))
      must(await sb.from('alerts').delete().eq('user_id', userId))
    },

    async saveProfile(patch) {
      must(await sb.from('profiles').update(patch).eq('id', userId))
    },

    async saveProperty(p) {
      const { id, created_at, ...rest } = p as Record<string, unknown>
      const row = id
        ? must(await sb.from('properties').update(rest).eq('id', id as string).select().single())
        : must(await sb.from('properties').insert({ ...rest, user_id: userId }).select().single())
      return row as never
    },
    async deleteProperty(id) { must(await sb.from('properties').delete().eq('id', id)) },

    async addExpense(e) { must(await sb.from('expenses').insert(e)) },
    async updateExpense(id, e) { must(await sb.from('expenses').update(e).eq('id', id)) },
    async deleteExpense(id) { must(await sb.from('expenses').delete().eq('id', id)) },

    async addReservation(r) { must(await sb.from('reservations').insert(r)) },
    async deleteReservation(id) { must(await sb.from('reservations').delete().eq('id', id)) },

    async ingestReservations(rows, meta) {
      const payload = rows.map(({ property_ref, ...r }) => ({ ...r, currency: r.currency ?? 'EUR', source: meta.source }))
      for (let i = 0; i < payload.length; i += CHUNK) {
        // L'index unique (property_id, external_id) garantit qu'aucun doublon n'est créé, même en cas d'import concurrent.
        const { error } = await sb.from('reservations').upsert(payload.slice(i, i + CHUNK), { onConflict: 'property_id,external_id', ignoreDuplicates: true })
        if (error) throw new Error(error.message)
      }
      must(await sb.from('imports').insert({ user_id: userId, filename: meta.filename, source: meta.source, rows_imported: rows.length, duplicates: meta.duplicates }))
    },

    async saveTarget(t) { must(await sb.from('property_targets').upsert(t, { onConflict: 'property_id' })) },

    async replaceCalendarEvents(propertyId, source, events) {
      must(await sb.from('calendar_events').delete().eq('property_id', propertyId).eq('source', source))
      await insertChunks(sb, 'calendar_events', events.map((e) => ({ ...e, property_id: propertyId, source })))
    },
    async addCalendar(c) { must(await sb.from('property_calendars').insert(c)) },
    async deleteCalendar(id) { must(await sb.from('property_calendars').delete().eq('id', id)) },
    async syncCalendars(propertyId) {
      const { data, error } = await sb.functions.invoke('ical-sync', { body: { property_id: propertyId } })
      if (error) throw new Error(error.message)
      return data as { events: number }
    },

    async setFxRate(base, quote, rate) {
      must(await sb.from('fx_rates').upsert({ user_id: userId, base, quote, rate, source: 'manual', as_of: todayStr() }, { onConflict: 'user_id,base,quote' }))
    },
    async deleteFxRate(id) { must(await sb.from('fx_rates').delete().eq('id', id)) },

    async insertAlerts(alerts) {
      if (!alerts.length) return []
      const rows = alerts.map((a) => ({ ...a, user_id: userId }))
      const { data, error } = await sb.from('alerts').upsert(rows, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true }).select()
      if (error) throw new Error(error.message)
      return (data ?? []) as AlertRow[]
    },
    async markAlerts(ids, read) {
      if (ids.length) must(await sb.from('alerts').update({ read }).in('id', ids))
    },
  }
}
