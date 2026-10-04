import { addDays, diffDays, toDay } from './dates'
import { rangeMetrics, type PreparedProperty } from './metrics'
import type { Property } from './types'

/**
 * Rentabilité d'un logement acheté (cash, sans crédit).
 * Capital investi = prix d'achat + frais d'acquisition + ameublement.
 * Les indicateurs « observés » viennent des réservations/dépenses réelles depuis la mise en location ;
 * la simulation les prend comme point de départ, puis l'utilisateur peut modifier chaque hypothèse.
 */
export interface Assumptions {
  occupancy: number // % des nuits disponibles
  adr: number // revenu brut par nuit vendue
  feePct: number // frais de plateforme, % du brut
  taxPct: number // impôt retenu à la source, % du brut
  fixedCosts: number // charges fixes mensuelles (copro, internet, électricité, ménage…)
}

export interface InvestmentSummary {
  invested: number
  price: number
  costs: number
  furnishing: number | null
  operatingDays: number
  cumulativeProfit: number // net − dépenses, depuis la mise en location jusqu'à hier
  recoveredPct: number
  securedFuture: number // revenu net déjà confirmé à venir
  grossYield: number | null // % annualisé
  netYield: number | null
  observed: Assumptions | null
}

export const DAYS_PER_MONTH = 30.4

export function monthlyProfit(a: Assumptions): number {
  return (a.occupancy / 100) * DAYS_PER_MONTH * a.adr * (1 - a.feePct / 100 - a.taxPct / 100) - a.fixedCosts
}
export const annualGross = (a: Assumptions) => (a.occupancy / 100) * 365 * a.adr

export function investmentSummary(pp: PreparedProperty, p: Property, today: string): InvestmentSummary | null {
  if (p.purchase_price == null) return null
  const price = p.purchase_price
  const costs = p.purchase_costs ?? 0
  const furnishing = p.furnishing_cost
  const invested = price + costs + (furnishing ?? 0)
  const from = addDays(new Date(pp.listedFrom * 86_400_000).toISOString().slice(0, 10), 0)
  const to = addDays(today, -1)
  const days = Math.max(0, diffDays(from, to) + 1)
  const m = rangeMetrics(pp, from, to)
  let taxes = 0
  let other = 0
  for (const e of pp.expenses) if (e.date >= from && e.date <= to) e.category === 'taxes' ? (taxes += e.amount) : (other += e.amount)
  const months = days / DAYS_PER_MONTH
  const secured = rangeMetrics(pp, today, addDays(today, 365)).net
  const observed: Assumptions | null =
    m.occupancy != null && m.adr != null && m.gross > 0
      ? { occupancy: m.occupancy, adr: m.adr, feePct: (m.fees / m.gross) * 100, taxPct: (taxes / m.gross) * 100, fixedCosts: months > 0 ? other / months : 0 }
      : null
  return {
    invested, price, costs, furnishing, operatingDays: days, cumulativeProfit: m.profit,
    recoveredPct: invested > 0 ? (m.profit / invested) * 100 : 0, securedFuture: secured,
    grossYield: observed && invested > 0 ? (annualGross(observed) / invested) * 100 : null,
    netYield: observed && invested > 0 ? ((monthlyProfit(observed) * 12) / invested) * 100 : null,
    observed,
  }
}

/** Années pour récupérer le capital investi à partir du profit déjà réalisé et d'un profit mensuel supposé constant. */
export function paybackYears(invested: number, alreadyRecovered: number, monthly: number): number | null {
  if (monthly <= 0) return null
  return Math.max(0, invested - alreadyRecovered) / (monthly * 12)
}

export function projection(invested: number, alreadyRecovered: number, monthly: number, years = 15) {
  return Array.from({ length: years + 1 }, (_, y) => ({ year: y, cumulative: alreadyRecovered + monthly * 12 * y, invested }))
}
void toDay
