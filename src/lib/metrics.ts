import type { CalendarEvent, Currency, Dataset, Expense, FxRate, Property, RefAdr, Reservation } from './types'
import { addDays, addMonths, diffDays, endOfMonth, fromDay, toDay, todayStr } from './dates'

/* ────────────────────────────────────────────────────────────────
 * Moteur de calcul. Toutes les valeurs affichées dans l'UI viennent d'ici,
 * calculées à partir des réservations / dépenses / événements stockés.
 *
 *  Occupation      = nuits réservées / nuits disponibles × 100
 *  ADR             = revenu hébergement (brut) / nuits vendues
 *  RevPAR          = revenu hébergement (brut) / nuits disponibles
 *  Profit net      = revenu net − dépenses
 *  Séjour moyen    = nuits des séjours arrivant dans la période / nombre de séjours
 *  Lead time       = check-in − date de réservation
 *  Opportunité     = nuits disponibles non vendues × ADR de référence
 *
 * Une réservation couvre les nuits [check_in, check_out[ ; son revenu est réparti
 * à parts égales sur ses nuits, ce qui permet de ventiler un séjour à cheval sur 2 mois.
 * ──────────────────────────────────────────────────────────────── */

export interface Sums {
  days: number
  availableNights: number
  blockedNights: number
  reservedNights: number // inclut les nuits « réservées » issues d'un iCal (sans revenu connu)
  soldNights: number // nuits couvertes par une réservation avec revenu (base de l'ADR)
  bookings: number
  stayNights: number
  leadSum: number
  leadCount: number
  gross: number
  fees: number
  net: number
  expenses: number
  cancellations: number
}

export interface RangeMetrics extends Sums {
  from: string
  to: string
  profit: number
  occupancy: number | null
  adr: number | null
  revpar: number | null
  avgStay: number | null
  avgLeadTime: number | null
  avgRevenuePerBooking: number | null
}

const MONEY_KEYS = ['gross', 'fees', 'net', 'expenses'] as const

export const emptySums = (): Sums => ({
  days: 0, availableNights: 0, blockedNights: 0, reservedNights: 0, soldNights: 0, bookings: 0,
  stayNights: 0, leadSum: 0, leadCount: 0, gross: 0, fees: 0, net: 0, expenses: 0, cancellations: 0,
})

export function finalize(s: Sums, from: string, to: string): RangeMetrics {
  return {
    ...s,
    from,
    to,
    profit: s.net - s.expenses,
    occupancy: s.availableNights > 0 ? (s.reservedNights / s.availableNights) * 100 : null,
    adr: s.soldNights > 0 ? s.gross / s.soldNights : null,
    revpar: s.availableNights > 0 ? s.gross / s.availableNights : null,
    avgStay: s.bookings > 0 ? s.stayNights / s.bookings : null,
    avgLeadTime: s.leadCount > 0 ? s.leadSum / s.leadCount : null,
    avgRevenuePerBooking: s.bookings > 0 ? s.net / s.bookings : null,
  }
}

/* ───────────── Devises ───────────── */

export class Fx {
  private map = new Map<string, number>()
  constructor(rates: FxRate[]) {
    for (const r of rates) this.map.set(`${r.base}>${r.quote}`, Number(r.rate))
  }
  /** Taux de `from` vers `to`, ou null s'il n'est pas renseigné (jamais de taux inventé). */
  rate(from: Currency, to: Currency): number | null {
    if (from === to) return 1
    const d = this.map.get(`${from}>${to}`)
    if (d) return d
    const inv = this.map.get(`${to}>${from}`)
    return inv ? 1 / inv : null
  }
  convert(v: number, from: Currency, to: Currency): number | null {
    const r = this.rate(from, to)
    return r == null ? null : v * r
  }
}

/* ───────────── Préparation des données par logement ───────────── */

type NightCell = { t: 'res'; i: number } | { t: 'ical' } | { t: 'blocked' }

export interface PreparedProperty {
  property: Property
  all: Reservation[] // toutes, y compris annulées
  active: Reservation[] // hors annulées, triées par check-in
  nights: Map<number, NightCell>
  expenses: Expense[] // récurrences déjà développées
  listedFrom: number
  lastNight: number // dernière nuit connue (réservation / événement)
}

export interface Analytics {
  today: string
  props: Map<string, PreparedProperty>
  fx: Fx
  main: Currency
}

const STEP: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 }

/** Développe les dépenses récurrentes en occurrences datées jusqu'à `horizon` (incluse). */
export function expandExpenses(expenses: Expense[], horizon: string): Expense[] {
  const out: Expense[] = []
  for (const e of expenses) {
    if (!e.recurring || !e.recurrence_interval) {
      out.push(e)
      continue
    }
    const step = STEP[e.recurrence_interval] ?? 1
    const end = e.recurrence_end && e.recurrence_end < horizon ? e.recurrence_end : horizon
    for (let k = 0; k < 600; k++) {
      const d = addMonths(e.date, k * step)
      if (d > end) break
      out.push({ ...e, id: `${e.id}#${k}`, date: d })
    }
  }
  return out
}

export function buildAnalytics(ds: Dataset, today = todayStr()): Analytics {
  const props = new Map<string, PreparedProperty>()
  const horizon = endOfMonth(today)
  const byProp = <T extends { property_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>()
    for (const r of rows) {
      const l = m.get(r.property_id)
      l ? l.push(r) : m.set(r.property_id, [r])
    }
    return m
  }
  const resBy = byProp(ds.reservations)
  const evBy = byProp(ds.calendarEvents)
  const expBy = byProp(ds.expenses)

  for (const property of ds.properties) {
    const all = resBy.get(property.id) ?? []
    // Les demandes « en attente » ne sont pas sécurisées : elles ne comptent ni dans les nuits ni dans les revenus.
    const active = all.filter((r) => r.status === 'confirmed' || r.status === 'completed').sort((a, b) => a.check_in.localeCompare(b.check_in))
    const nights = new Map<number, NightCell>()
    const events: CalendarEvent[] = evBy.get(property.id) ?? []
    let first = Infinity
    let last = -Infinity
    for (const ev of events) {
      if (ev.event_type === 'available') continue
      const t = ev.event_type === 'reserved' ? 'ical' : 'blocked'
      for (let d = toDay(ev.start_date); d < toDay(ev.end_date); d++) nights.set(d, { t } as NightCell)
      first = Math.min(first, toDay(ev.start_date))
      last = Math.max(last, toDay(ev.end_date) - 1)
    }
    active.forEach((r, i) => {
      for (let d = toDay(r.check_in); d < toDay(r.check_out); d++) nights.set(d, { t: 'res', i })
      first = Math.min(first, toDay(r.check_in))
      last = Math.max(last, toDay(r.check_out) - 1)
    })
    const listedFrom = property.listed_since ? toDay(property.listed_since) : isFinite(first) ? first : toDay(today)
    props.set(property.id, {
      property,
      all,
      active,
      nights,
      expenses: expandExpenses(expBy.get(property.id) ?? [], horizon),
      listedFrom,
      lastNight: isFinite(last) ? last : listedFrom,
    })
  }
  return { today, props, fx: new Fx(ds.fxRates), main: ds.profile.main_currency }
}

/* ───────────── Métriques sur une période (devise native du logement) ───────────── */

export function rangeSums(pp: PreparedProperty, from: string, to: string): Sums {
  const s = emptySums()
  const a = toDay(from)
  const b = toDay(to)
  for (let d = a; d <= b; d++) {
    if (d < pp.listedFrom) continue
    s.days++
    const cell = pp.nights.get(d)
    if (!cell) continue
    if (cell.t === 'blocked') s.blockedNights++
    else if (cell.t === 'ical') s.reservedNights++
    else {
      const r = pp.active[cell.i]
      s.reservedNights++
      s.soldNights++
      s.gross += r.gross_revenue / r.nights
      s.fees += r.platform_fee / r.nights
      s.net += r.net_revenue / r.nights
    }
  }
  s.availableNights = s.days - s.blockedNights
  for (const r of pp.active) {
    if (r.check_in >= from && r.check_in <= to) {
      s.bookings++
      s.stayNights += r.nights
      if (r.booking_date) {
        s.leadSum += Math.max(0, diffDays(r.booking_date, r.check_in))
        s.leadCount++
      }
    }
  }
  for (const r of pp.all) if (r.status === 'cancelled' && r.check_in >= from && r.check_in <= to) s.cancellations++
  for (const e of pp.expenses) if (e.date >= from && e.date <= to) s.expenses += Number(e.amount)
  return s
}

export const rangeMetrics = (pp: PreparedProperty, from: string, to: string): RangeMetrics =>
  finalize(rangeSums(pp, from, to), from, to)

/* ───────────── Agrégation multi-logements / multi-devises ───────────── */

export interface Aggregate {
  m: RangeMetrics
  excluded: Property[] // logements dont la devise n'a pas de taux vers la devise d'affichage
  included: Property[]
}

export function aggregate(
  an: Analytics,
  list: Property[],
  display: Currency,
  from: string,
  to: string,
): Aggregate {
  const total = emptySums()
  const excluded: Property[] = []
  const included: Property[] = []
  for (const p of list) {
    const pp = an.props.get(p.id)
    if (!pp) continue
    const rate = an.fx.rate(p.currency, display)
    if (rate == null) {
      excluded.push(p)
      continue
    }
    included.push(p)
    const s = rangeSums(pp, from, to)
    for (const k of Object.keys(s) as (keyof Sums)[]) {
      total[k] += (MONEY_KEYS as readonly string[]).includes(k) ? s[k] * rate : s[k]
    }
  }
  return { m: finalize(total, from, to), excluded, included }
}

/* ───────────── Variations ───────────── */

export const pctChange = (cur: number | null, prev: number | null): number | null =>
  cur == null || prev == null || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100
export const ptsChange = (cur: number | null, prev: number | null): number | null =>
  cur == null || prev == null ? null : cur - prev

/* ───────────── ADR de référence & Revenue Opportunity ───────────── */

export const REF_ADR_DAYS: Record<RefAdr, number> = { '30d': 30, '90d': 90, '365d': 365 }
export const REF_ADR_LABELS: Record<RefAdr, string> = { '30d': 'Moyenne 30 jours', '90d': 'Moyenne 90 jours', '365d': 'Moyenne annuelle' }

/** ADR récent d'un logement, calculé sur les nuits passées (veille incluse). */
export function referenceAdr(pp: PreparedProperty, kind: RefAdr, today: string): number | null {
  const days = REF_ADR_DAYS[kind]
  const m = rangeMetrics(pp, addDays(today, -days), addDays(today, -1))
  if (m.adr != null) return m.adr
  if (kind !== '365d') return referenceAdr(pp, kind === '30d' ? '90d' : '365d', today)
  return null
}

export interface Opportunity {
  realized: number // revenu hébergement réalisé (brut)
  unsoldNights: number
  adr: number | null
  uncaptured: number // revenu non capté estimé
  potential: number // revenu potentiel estimé = réalisé + non capté
}

export function opportunity(pp: PreparedProperty, from: string, to: string, adr: number | null): Opportunity {
  const s = rangeSums(pp, from, to)
  const unsold = Math.max(0, s.availableNights - s.reservedNights)
  const uncaptured = adr != null ? unsold * adr : 0
  return { realized: s.gross, unsoldNights: unsold, adr, uncaptured, potential: s.gross + uncaptured }
}

/* ───────────── Trous de disponibilité ───────────── */

export interface Gap {
  propertyId: string
  start: string // première nuit libre
  end: string // jour de départ (exclusif)
  nights: number
  before: Reservation | null
  after: Reservation | null
  potential: number | null
}

/** Périodes libres encadrées de part et d'autre par un séjour. */
export function findGaps(pp: PreparedProperty, from: string, to: string, adr: number | null): Gap[] {
  const out: Gap[] = []
  const lo = Math.max(pp.listedFrom, toDay(from) - 120)
  let d = lo
  const hi = Math.min(pp.lastNight, toDay(to) + 120)
  while (d <= hi) {
    if (!pp.nights.has(d) && pp.nights.get(d - 1)?.t !== undefined && pp.nights.get(d - 1)?.t !== 'blocked') {
      let e = d
      while (e <= hi && !pp.nights.has(e)) e++
      const afterCell = pp.nights.get(e)
      if (afterCell && afterCell.t !== 'blocked' && e <= pp.lastNight) {
        const startStr = fromDay(d)
        const endStr = fromDay(e)
        if (endStr > from && startStr <= to) {
          const bc = pp.nights.get(d - 1)
          const before = bc?.t === 'res' ? pp.active[bc.i] : null
          const after = afterCell.t === 'res' ? pp.active[afterCell.i] : null
          out.push({
            propertyId: pp.property.id,
            start: startStr,
            end: endStr,
            nights: e - d,
            before,
            after,
            potential: adr != null ? (e - d) * adr : null,
          })
        }
      }
      d = e
    } else d++
  }
  return out
}

/* ───────────── Nuits libres / prochaine réservation ───────────── */

export function freeNights(pp: PreparedProperty, from: string, to: string): number {
  let n = 0
  for (let d = Math.max(toDay(from), pp.listedFrom); d <= toDay(to); d++) if (!pp.nights.has(d)) n++
  return n
}

export function nextReservation(pp: PreparedProperty, today: string): Reservation | null {
  return pp.active.find((r) => r.check_in >= today) ?? null
}

export function monthSeries(pp: PreparedProperty, months: string[]): RangeMetrics[] {
  return months.map((m) => rangeMetrics(pp, m, endOfMonth(m)))
}
