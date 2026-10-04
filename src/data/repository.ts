import type {
  AlertRow, Currency, Dataset, Expense, Profile, Property, PropertyCalendar, PropertyTarget, Reservation,
} from '../lib/types'
import type { ComputedAlert } from '../lib/alerts'
import type { NormalizedReservation } from '../imports/types'

export type NewExpense = Omit<Expense, 'id' | 'created_at'>
export type NewReservation = Omit<Reservation, 'id' | 'nights' | 'created_at'>
export type IngestRow = NormalizedReservation & { property_id: string }
export interface CalendarEventInput { external_id: string | null; start_date: string; end_date: string; event_type: 'reserved' | 'blocked' }

/**
 * Contrat d'accès aux données. L'UI ne parle qu'à cette interface :
 *  - SupabaseRepo : vraies requêtes Supabase (RLS par utilisateur)
 *  - LocalRepo    : mode démo hors-ligne (localStorage), même contrat
 * Les futures sources (PMS, API Airbnb, webhooks) passent par `ingestReservations` / `replaceCalendarEvents`.
 */
export interface Repo {
  mode: 'supabase' | 'local'
  load(): Promise<Dataset>
  seedDemo(): Promise<void>
  clearAll(): Promise<void>

  saveProfile(patch: Partial<Pick<Profile, 'display_name' | 'main_currency' | 'settings'>>): Promise<void>
  saveProperty(p: Partial<Property> & { name: string }): Promise<Property>
  deleteProperty(id: string): Promise<void>

  addExpense(e: NewExpense): Promise<void>
  updateExpense(id: string, e: Partial<NewExpense>): Promise<void>
  deleteExpense(id: string): Promise<void>

  addReservation(r: NewReservation): Promise<void>
  deleteReservation(id: string): Promise<void>
  ingestReservations(rows: IngestRow[], meta: { filename: string; source: string; duplicates: number }): Promise<void>

  saveTarget(t: Omit<PropertyTarget, 'id'>): Promise<void>

  replaceCalendarEvents(propertyId: string, source: string, events: CalendarEventInput[]): Promise<void>
  addCalendar(c: Omit<PropertyCalendar, 'id' | 'last_synced_at' | 'last_status'>): Promise<void>
  deleteCalendar(id: string): Promise<void>
  /** Appelle l'Edge Function `ical-sync` (Supabase uniquement). */
  syncCalendars(propertyId: string): Promise<{ events: number }>

  setFxRate(base: Currency, quote: Currency, rate: number): Promise<void>
  deleteFxRate(id: string): Promise<void>

  insertAlerts(alerts: ComputedAlert[]): Promise<AlertRow[]>
  markAlerts(ids: string[], read: boolean): Promise<void>
}
