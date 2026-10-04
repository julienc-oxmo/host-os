import { endOfMonth, monthsBetween, toDay } from './dates'
import { Fx, type PreparedProperty, rangeMetrics } from './metrics'
import type { Currency, ExpenseCategory, Property } from './types'

/* ───────────── Heatmap mois × jour de semaine ───────────── */

export interface HeatCell { occupancy: number | null; revenue: number; nights: number; available: number }

/** 12 colonnes (mois de l'année) × 7 lignes (lundi→dimanche). Revenu = hébergement brut converti. */
export function heatmap(
  items: { pp: PreparedProperty; rate: number }[],
  year: number,
): HeatCell[][] {
  const grid: HeatCell[][] = Array.from({ length: 12 }, () =>
    Array.from({ length: 7 }, () => ({ occupancy: null, revenue: 0, nights: 0, available: 0 })),
  )
  for (const { pp, rate } of items) {
    for (let d = toDay(`${year}-01-01`); d <= toDay(`${year}-12-31`); d++) {
      if (d < pp.listedFrom) continue
      const dt = new Date(d * 86_400_000)
      const m = dt.getUTCMonth()
      const wd = (((d + 3) % 7) + 7) % 7
      const cell = pp.nights.get(d)
      const g = grid[m][wd]
      if (cell?.t === 'blocked') continue
      g.available++
      if (cell) {
        g.nights++
        if (cell.t === 'res') {
          const r = pp.active[cell.i]
          g.revenue += (r.gross_revenue / r.nights) * rate
        }
      }
    }
  }
  for (const row of grid) for (const c of row) c.occupancy = c.available > 0 ? (c.nights / c.available) * 100 : null
  return grid
}

/* ───────────── Séjours par durée ───────────── */

export interface StayBucket { label: string; min: number; max: number; bookings: number; nights: number; gross: number; net: number; adr: number | null; avgNet: number | null }
const BUCKETS: [string, number, number][] = [['1-3 nuits', 1, 3], ['4-6 nuits', 4, 6], ['7-13 nuits', 7, 13], ['14 nuits et +', 14, 999]]

export function stayBuckets(pps: PreparedProperty[], from: string, to: string): StayBucket[] {
  const out: StayBucket[] = BUCKETS.map(([label, min, max]) => ({ label, min, max, bookings: 0, nights: 0, gross: 0, net: 0, adr: null, avgNet: null }))
  for (const pp of pps)
    for (const r of pp.active) {
      if (r.check_in < from || r.check_in > to) continue
      const b = out.find((x) => r.nights >= x.min && r.nights <= x.max)!
      b.bookings++
      b.nights += r.nights
      b.gross += r.gross_revenue
      b.net += r.net_revenue
    }
  for (const b of out) {
    b.adr = b.nights ? b.gross / b.nights : null
    b.avgNet = b.bookings ? b.net / b.bookings : null
  }
  return out
}

/* ───────────── Waterfall revenus → profit ───────────── */

export type WaterfallGroup = 'fees' | 'cleaning' | 'maintenance' | 'charges' | 'taxes'
export const WATERFALL_GROUP: Record<ExpenseCategory, WaterfallGroup> = {
  cleaning: 'cleaning',
  maintenance: 'maintenance',
  furniture: 'maintenance',
  insurance: 'charges',
  internet: 'charges',
  electricity: 'charges',
  condo: 'charges',
  supplies: 'charges',
  other: 'charges',
  taxes: 'taxes',
}

export interface WaterfallStep { key: string; label: string; value: number; kind: 'total' | 'delta' }

export function waterfall(
  items: { pp: PreparedProperty; rate: number }[],
  from: string,
  to: string,
): { steps: WaterfallStep[]; gross: number; profit: number } {
  let gross = 0
  let fees = 0
  const groups: Record<WaterfallGroup, number> = { fees: 0, cleaning: 0, maintenance: 0, charges: 0, taxes: 0 }
  for (const { pp, rate } of items) {
    const m = rangeMetrics(pp, from, to)
    gross += m.gross * rate
    fees += m.fees * rate
    for (const e of pp.expenses) if (e.date >= from && e.date <= to) groups[WATERFALL_GROUP[e.category]] += Number(e.amount) * rate
  }
  const profit = gross - fees - groups.cleaning - groups.maintenance - groups.charges - groups.taxes
  return {
    gross,
    profit,
    steps: [
      { key: 'gross', label: 'Revenus bruts', value: gross, kind: 'total' },
      { key: 'fees', label: 'Frais plateforme', value: -fees, kind: 'delta' },
      { key: 'cleaning', label: 'Ménage', value: -groups.cleaning, kind: 'delta' },
      { key: 'maintenance', label: 'Maintenance', value: -groups.maintenance, kind: 'delta' },
      { key: 'charges', label: 'Charges', value: -groups.charges, kind: 'delta' },
      { key: 'taxes', label: 'Taxes', value: -groups.taxes, kind: 'delta' },
      { key: 'profit', label: 'Profit net', value: profit, kind: 'total' },
    ],
  }
}

/* ───────────── Séries mensuelles agrégées ───────────── */

export interface MonthPoint {
  month: string
  gross: number
  net: number
  profit: number
  occupancy: number | null
  adr: number | null
  revpar: number | null
  expenses: number
  fees: number
  bookings: number
  reservedNights: number
  availableNights: number
}

export function aggregatedMonthSeries(
  items: { pp: PreparedProperty; rate: number }[],
  from: string,
  to: string,
): MonthPoint[] {
  return monthsBetween(from, to).map((m) => {
    let gross = 0, net = 0, expenses = 0, fees = 0, sold = 0, reserved = 0, avail = 0, bookings = 0
    for (const { pp, rate } of items) {
      const s = rangeMetrics(pp, m, endOfMonth(m))
      gross += s.gross * rate; net += s.net * rate; expenses += s.expenses * rate; fees += s.fees * rate
      sold += s.soldNights; reserved += s.reservedNights; avail += s.availableNights; bookings += s.bookings
    }
    return {
      month: m, gross, net, expenses, fees, profit: net - expenses, bookings,
      reservedNights: reserved, availableNights: avail,
      occupancy: avail ? (reserved / avail) * 100 : null,
      adr: sold ? gross / sold : null,
      revpar: avail ? gross / avail : null,
    }
  })
}

export function convertibleItems(
  props: Property[],
  get: (id: string) => PreparedProperty | undefined,
  fx: Fx,
  display: Currency,
) {
  const items: { pp: PreparedProperty; rate: number }[] = []
  const excluded: Property[] = []
  for (const p of props) {
    const pp = get(p.id)
    if (!pp) continue
    const rate = fx.rate(p.currency, display)
    rate == null ? excluded.push(p) : items.push({ pp, rate })
  }
  return { items, excluded }
}
