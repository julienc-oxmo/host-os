import { addDays, todayStr } from '../lib/dates'
import type { ParsedCsv } from '../lib/csv'
import type { Currency, ReservationStatus } from '../lib/types'
import type { NormalizedReservation } from './types'

export type ImportField =
  | 'external_id' | 'listing' | 'guest_name' | 'booking_date' | 'check_in' | 'check_out' | 'nights'
  | 'gross_revenue' | 'platform_fee' | 'net_revenue' | 'currency' | 'channel' | 'status'

export interface FieldDef {
  key: ImportField
  label: string
  required?: boolean
  hint?: string
  synonyms: string[]
}

// Les exports Airbnb existent en plusieurs langues et formats : on détecte par synonymes (FR / EN / ES).
export const FIELDS: FieldDef[] = [
  { key: 'external_id', label: 'Identifiant externe', hint: 'Sert à détecter les doublons', synonyms: ['code de confirmation', 'confirmation code', 'código de confirmación', 'codigo de confirmacion', 'reservation id', 'reservation code', 'id réservation', 'external id', 'code'] },
  { key: 'listing', label: 'Logement', synonyms: ['logement', 'annonce', 'listing', 'property', 'propiedad', 'alojamiento', 'nom du logement'] },
  { key: 'guest_name', label: 'Voyageur', synonyms: ['nom du voyageur', 'voyageur', 'guest', 'guest name', 'huésped', 'huesped', 'nombre del huésped'] },
  { key: 'booking_date', label: 'Date de réservation', synonyms: ['réservé', 'reserve', 'date de réservation', 'booking date', 'booked', 'fecha de reserva', 'date de reservation', 'created'] },
  { key: 'check_in', label: 'Arrivée (check-in)', required: true, synonyms: ['date de début', 'début', 'arrivée', 'date d’arrivée', "date d'arrivée", 'check-in', 'check in', 'checkin', 'start date', 'arrival', 'fecha de inicio', 'llegada'] },
  { key: 'check_out', label: 'Départ (check-out)', synonyms: ['date de fin', 'fin', 'départ', 'date de départ', 'check-out', 'check out', 'checkout', 'end date', 'departure', 'fecha de finalización', 'salida'] },
  { key: 'nights', label: 'Nuits', synonyms: ['# de nuits', 'nuits', 'nombre de nuits', 'nights', '# of nights', 'noches', 'nb nuits'] },
  { key: 'gross_revenue', label: 'Revenu brut', required: true, synonyms: ['revenus bruts', 'revenu brut', 'gross earnings', 'gross revenue', 'gross', 'ingresos brutos', 'montant', 'amount', 'revenus', 'revenu', 'total'] },
  { key: 'platform_fee', label: 'Frais de plateforme', synonyms: ['frais de service', 'frais de service airbnb', 'service fee', 'host fee', 'commission', 'frais', 'tarifa de servicio', 'platform fee'] },
  { key: 'net_revenue', label: 'Revenu net', synonyms: ['versé', 'verse', 'net', 'net revenue', 'payout', 'earnings', 'gains', 'revenus nets', 'ganancias', 'paid out', 'montant versé'] },
  { key: 'currency', label: 'Devise', synonyms: ['devise', 'currency', 'moneda'] },
  { key: 'channel', label: 'Canal', synonyms: ['canal', 'channel', 'source', 'plateforme', 'platform', 'canal d’acquisition'] },
  { key: 'status', label: 'Statut', synonyms: ['statut', 'status', 'état', 'estado'] },
]

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, "'").replace(/\s+/g, ' ').trim()

/** Détecte la colonne CSV pour chaque champ : correspondance exacte d'abord, puis « contient ». */
export function detectMapping(headers: string[]): Record<ImportField, number | null> {
  const nh = headers.map(norm)
  const used = new Set<number>()
  const out = {} as Record<ImportField, number | null>
  for (const pass of ['exact', 'contains'] as const) {
    for (const f of FIELDS) {
      if (out[f.key] != null) continue
      for (const syn of f.synonyms.map(norm)) {
        const idx = nh.findIndex((h, i) => !used.has(i) && (pass === 'exact' ? h === syn : h.includes(syn) && syn.length >= 4))
        if (idx >= 0) { out[f.key] = idx; used.add(idx); break }
      }
    }
  }
  for (const f of FIELDS) out[f.key] ??= null
  return out
}

/* ───────────── Dates ───────────── */
export type DateOrder = 'auto' | 'dmy' | 'mdy'
const MONTHS: Record<string, number> = {
  janv: 1, jan: 1, january: 1, enero: 1, fevr: 2, feb: 2, fev: 2, february: 2, febrero: 2, mars: 3, mar: 3, march: 3, marzo: 3,
  avr: 4, apr: 4, april: 4, abril: 4, mai: 5, may: 5, mayo: 5, juin: 6, jun: 6, june: 6, junio: 6, juil: 7, jul: 7, july: 7, julio: 7,
  aout: 8, aug: 8, august: 8, ago: 8, agosto: 8, sept: 9, sep: 9, september: 9, septiembre: 9, oct: 10, october: 10, octubre: 10,
  nov: 11, november: 11, noviembre: 11, dec: 12, december: 12, dic: 12, diciembre: 12,
}
const p2 = (n: number) => String(n).padStart(2, '0')
const valid = (y: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCMonth() === m - 1 ? `${y}-${p2(m)}-${p2(d)}` : null
}

export function detectDateOrder(values: string[]): 'dmy' | 'mdy' {
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/)
    if (!m) continue
    if (Number(m[1]) > 12) return 'dmy'
    if (Number(m[2]) > 12) return 'mdy'
  }
  return 'dmy'
}

export function parseDate(raw: string | undefined, order: 'dmy' | 'mdy'): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return valid(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/)
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]
    return order === 'dmy' ? valid(y, +m[2], +m[1]) : valid(y, +m[1], +m[2])
  }
  m = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f.,]/g, '').match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})/)
  if (m) {
    const mo = MONTHS[m[2]] ?? MONTHS[m[2].slice(0, 3)]
    return mo ? valid(+m[3], mo, +m[1]) : null
  }
  return null
}

/* ───────────── Montants / devises ───────────── */
export function parseAmount(raw: string | undefined): number | null {
  if (raw == null) return null
  let s = raw.trim()
  if (!s) return null
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /−/.test(s)
  s = s.replace(/[^\d.,]/g, '')
  if (!s) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.'
    s = dec === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    s = /,\d{1,2}$/.test(s) && s.indexOf(',') === lastComma ? s.replace(',', '.') : s.replace(/,/g, '')
  } else if (lastDot >= 0 && (s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '')
  const n = parseFloat(s)
  return isFinite(n) ? (neg ? -n : n) : null
}

export function parseCurrency(raw: string | undefined): Currency | null {
  if (!raw) return null
  const s = raw.toUpperCase()
  if (/MXN|MX\$|PESO/.test(s)) return 'MXN'
  if (/EUR|€/.test(s)) return 'EUR'
  if (/USD|US\$|\$/.test(s)) return 'USD'
  return null
}

export function parseStatus(raw: string | undefined, checkOut: string, today: string): ReservationStatus {
  const s = norm(raw ?? '')
  if (/annul|cancel|rechaz|declin|refus/.test(s)) return 'cancelled'
  if (/attente|pending|demande|request|pendiente/.test(s)) return 'pending'
  if (/termin|past|complet|checked out|finaliz|passe/.test(s)) return 'completed'
  if (/confirm|accept|upcoming|a venir|en cours|current|checked in|actual/.test(s)) return checkOut <= today ? 'completed' : 'confirmed'
  return checkOut <= today ? 'completed' : 'confirmed'
}

export function parseChannel(raw: string | undefined): string {
  const s = norm(raw ?? '')
  if (!s) return 'airbnb'
  if (s.includes('airbnb')) return 'airbnb'
  if (s.includes('booking')) return 'booking'
  if (s.includes('vrbo') || s.includes('homeaway')) return 'vrbo'
  if (s.includes('direct')) return 'direct'
  return 'other'
}

/* ───────────── Normalisation des lignes ───────────── */

export interface RowIssue { row: number; level: 'error' | 'warning'; message: string }
export interface MappedResult {
  rows: (NormalizedReservation & { rowNumber: number; generatedId: boolean })[]
  issues: RowIssue[]
  currencyDetected: Currency | null
}
export interface MapOptions {
  mapping: Record<ImportField, number | null>
  dateOrder: DateOrder
  defaultCurrency: Currency
  defaultChannel?: string
  today?: string
}

export function normalizeRows(csv: ParsedCsv, o: MapOptions): MappedResult {
  const today = o.today ?? todayStr()
  const get = (r: string[], k: ImportField) => (o.mapping[k] != null ? r[o.mapping[k]!] : undefined)
  const order: 'dmy' | 'mdy' = o.dateOrder === 'auto'
    ? detectDateOrder(csv.rows.flatMap((r) => [get(r, 'check_in') ?? '', get(r, 'booking_date') ?? '']))
    : o.dateOrder
  const rows: MappedResult['rows'] = []
  const issues: RowIssue[] = []
  const seen = new Set<string>()
  let currencyDetected: Currency | null = null

  csv.rows.forEach((r, i) => {
    const rowNumber = i + 2 // ligne 1 = en-têtes
    const err = (message: string) => issues.push({ row: rowNumber, level: 'error', message })
    const warn = (message: string) => issues.push({ row: rowNumber, level: 'warning', message })

    const checkIn = parseDate(get(r, 'check_in'), order)
    if (!checkIn) return err('Date d’arrivée absente ou illisible.')
    let checkOut = parseDate(get(r, 'check_out'), order)
    const nightsRaw = parseAmount(get(r, 'nights'))
    if (!checkOut && nightsRaw && nightsRaw > 0) checkOut = addDays(checkIn, Math.round(nightsRaw))
    if (!checkOut) return err('Date de départ absente (et pas de nombre de nuits).')
    if (checkOut <= checkIn) return err('Le départ doit être après l’arrivée.')

    let gross = parseAmount(get(r, 'gross_revenue'))
    let fee = parseAmount(get(r, 'platform_fee'))
    let net = parseAmount(get(r, 'net_revenue'))
    if (gross == null && net == null) return err('Aucun montant (revenu brut ou net).')
    if (fee != null) fee = Math.abs(fee)
    if (gross == null) gross = (net ?? 0) + (fee ?? 0)
    if (net == null) net = gross - (fee ?? 0)
    if (fee == null) fee = Math.max(0, gross - net)
    if (gross < 0) return err('Montant négatif (ajustement ou remboursement ?) — ligne ignorée.')

    const cur = parseCurrency(get(r, 'currency')) ?? parseCurrency(get(r, 'gross_revenue'))
    if (cur && !currencyDetected) currencyDetected = cur

    const listing = (get(r, 'listing') ?? '').trim() || null
    const guest = (get(r, 'guest_name') ?? '').trim() || null
    let externalId = (get(r, 'external_id') ?? '').trim()
    let generatedId = false
    if (!externalId) {
      externalId = `csv:${listing ?? ''}:${checkIn}:${checkOut}:${guest ?? ''}`
      generatedId = true
      warn('Pas d’identifiant externe : un identifiant a été généré (dédoublonnage moins fiable).')
    }
    const key = `${listing ?? ''}|${externalId}`
    if (seen.has(key)) return warn('Doublon dans le fichier : ligne ignorée.')
    seen.add(key)

    const bookingDate = parseDate(get(r, 'booking_date'), order)
    if (bookingDate && bookingDate > checkIn) warn('La date de réservation est postérieure à l’arrivée.')

    rows.push({
      rowNumber, generatedId, external_id: externalId, property_ref: listing, guest_name: guest,
      booking_date: bookingDate, check_in: checkIn, check_out: checkOut,
      gross_revenue: Math.round(gross * 100) / 100, platform_fee: Math.round(fee * 100) / 100, net_revenue: Math.round(net * 100) / 100,
      currency: cur ?? null, channel: o.mapping.channel != null ? parseChannel(get(r, 'channel')) : (o.defaultChannel ?? 'airbnb'),
      status: parseStatus(get(r, 'status'), checkOut, today),
    })
  })
  return { rows, issues, currencyDetected }
}
