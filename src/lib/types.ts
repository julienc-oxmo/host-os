export type Currency = 'EUR' | 'MXN' | 'USD'
export const CURRENCIES: Currency[] = ['EUR', 'MXN', 'USD']

export type ReservationStatus = 'confirmed' | 'completed' | 'cancelled' | 'pending'
export type ExpenseCategory =
  | 'cleaning' | 'maintenance' | 'furniture' | 'insurance' | 'internet'
  | 'electricity' | 'condo' | 'taxes' | 'supplies' | 'other'
export type RecurrenceInterval = 'monthly' | 'quarterly' | 'yearly'
export type Severity = 'info' | 'watch' | 'important'
export type RefAdr = '30d' | '90d' | '365d'

export interface UserSettings {
  reference_adr?: RefAdr
  forecast_window_months?: 3 | 6 | 12
  theme?: 'light' | 'dark' | 'system'
}

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  main_currency: Currency
  settings: UserSettings
  created_at?: string
}

export interface Property {
  id: string
  user_id: string
  name: string
  city: string | null
  country: string | null
  currency: Currency
  address: string | null
  bedrooms: number
  capacity: number
  image_url: string | null
  airbnb_listing_id: string | null
  ical_url: string | null
  active: boolean
  listed_since: string | null
  purchase_price: number | null
  purchase_costs: number | null
  furnishing_cost: number | null
  purchase_date: string | null
  created_at: string
}

export interface Reservation {
  id: string
  property_id: string
  external_id: string | null
  guest_name: string | null
  booking_date: string | null
  check_in: string
  check_out: string
  nights: number
  gross_revenue: number
  platform_fee: number
  net_revenue: number
  currency: Currency
  channel: string
  status: ReservationStatus
  source?: string
  created_at?: string
}

export interface Expense {
  id: string
  property_id: string
  category: ExpenseCategory
  amount: number
  currency: Currency
  date: string
  description: string | null
  recurring: boolean
  recurrence_interval: RecurrenceInterval | null
  recurrence_end: string | null
  created_at?: string
}

export interface CalendarEvent {
  id: string
  property_id: string
  external_id: string | null
  start_date: string
  end_date: string // exclusive
  event_type: 'reserved' | 'blocked' | 'available'
  source: string
  created_at?: string
}

export interface PropertyCalendar {
  id: string
  property_id: string
  label: string
  url: string
  source: string
  last_synced_at: string | null
  last_status: string | null
}

export interface ImportRecord {
  id: string
  user_id: string
  filename: string | null
  source: string
  rows_imported: number
  duplicates: number
  imported_at: string
}

export interface PropertyTarget {
  id: string
  property_id: string
  monthly_revenue_target: number | null
  occupancy_target: number | null
  adr_target: number | null
}

export interface AlertRow {
  id: string
  user_id: string | null
  property_id: string | null
  type: string
  severity: Severity
  message: string
  dedupe_key: string | null
  created_at: string
  read: boolean
}

export interface FxRate {
  id: string
  user_id: string
  base: Currency
  quote: Currency
  rate: number
  as_of: string
  source: string
}

export interface Dataset {
  profile: Profile
  properties: Property[]
  reservations: Reservation[]
  expenses: Expense[]
  calendarEvents: CalendarEvent[]
  calendars: PropertyCalendar[]
  targets: PropertyTarget[]
  alerts: AlertRow[]
  imports: ImportRecord[]
  fxRates: FxRate[]
}

export const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  cleaning: 'Ménage',
  maintenance: 'Maintenance',
  furniture: 'Meubles',
  insurance: 'Assurance',
  internet: 'Internet',
  electricity: 'Électricité',
  condo: 'Copropriété',
  taxes: 'Taxes',
  supplies: 'Consommables',
  other: 'Autres',
}
export const EXPENSE_CATEGORIES = Object.keys(EXPENSE_LABELS) as ExpenseCategory[]

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed: 'Confirmée',
  completed: 'Terminée',
  cancelled: 'Annulée',
  pending: 'En attente',
}

export const CHANNEL_LABELS: Record<string, string> = {
  airbnb: 'Airbnb',
  booking: 'Booking.com',
  vrbo: 'Vrbo',
  direct: 'Direct',
  other: 'Autre',
}
