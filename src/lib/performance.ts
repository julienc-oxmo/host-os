import { addDays } from './dates'
import { rangeMetrics, type PreparedProperty } from './metrics'

export type PerfLevel = 'excellent' | 'good' | 'watch' | 'under' | 'unknown'

export const PERF_LABELS: Record<PerfLevel, string> = {
  excellent: 'Excellent',
  good: 'Bon',
  watch: 'À surveiller',
  under: 'Sous-performance',
  unknown: 'Historique insuffisant',
}

export interface PerfSignal {
  key: 'occupancy' | 'adr' | 'revpar' | 'revenue' | 'vacancy'
  label: string
  ratio: number
  current: number
  baseline: number
  weight: number
  unit: 'pct' | 'money' | 'nights'
}

export interface Performance {
  level: PerfLevel
  ratio: number | null
  signals: PerfSignal[]
}

const WEIGHTS = { occupancy: 0.3, revpar: 0.25, revenue: 0.2, adr: 0.15, vacancy: 0.1 } as const
const clip = (v: number) => Math.max(0.4, Math.min(1.6, v))

/**
 * Performance = comparaison du logement avec LUI-MÊME :
 * les 30 derniers jours vs la moyenne des 12 mois précédents.
 * Aucune note arbitraire : un ratio moyen pondéré de 5 signaux (occupation, RevPAR, revenu, ADR, nuits vacantes).
 *   ≥ 1,05 Excellent · ≥ 0,92 Bon · ≥ 0,80 À surveiller · sinon Sous-performance
 */
export function computePerformance(pp: PreparedProperty, today: string): Performance {
  const recent = rangeMetrics(pp, addDays(today, -29), today)
  const base = rangeMetrics(pp, addDays(today, -30 - 364), addDays(today, -30))
  if (base.availableNights < 90 || base.reservedNights === 0 || base.occupancy == null || recent.occupancy == null) {
    return { level: 'unknown', ratio: null, signals: [] }
  }
  const signals: PerfSignal[] = []
  const baseMonthlyNet = (base.net / base.availableNights) * 30
  const baseVacant30 = ((base.availableNights - base.reservedNights) / base.availableNights) * 30
  const recentVacant30 = ((recent.availableNights - recent.reservedNights) / Math.max(1, recent.availableNights)) * 30
  if (base.occupancy > 0)
    signals.push({ key: 'occupancy', label: 'Occupation', ratio: clip(recent.occupancy / base.occupancy), current: recent.occupancy, baseline: base.occupancy, weight: WEIGHTS.occupancy, unit: 'pct' })
  if (base.revpar && recent.revpar != null)
    signals.push({ key: 'revpar', label: 'RevPAR', ratio: clip(recent.revpar / base.revpar), current: recent.revpar, baseline: base.revpar, weight: WEIGHTS.revpar, unit: 'money' })
  if (baseMonthlyNet > 0)
    signals.push({ key: 'revenue', label: 'Revenu net (30 j)', ratio: clip(recent.net / baseMonthlyNet), current: recent.net, baseline: baseMonthlyNet, weight: WEIGHTS.revenue, unit: 'money' })
  if (base.adr && recent.adr != null)
    signals.push({ key: 'adr', label: 'ADR', ratio: clip(recent.adr / base.adr), current: recent.adr, baseline: base.adr, weight: WEIGHTS.adr, unit: 'money' })
  if (baseVacant30 > 0)
    signals.push({ key: 'vacancy', label: 'Nuits vacantes (30 j)', ratio: recentVacant30 === 0 ? 1.6 : clip(baseVacant30 / recentVacant30), current: recentVacant30, baseline: baseVacant30, weight: WEIGHTS.vacancy, unit: 'nights' })
  const wsum = signals.reduce((a, s) => a + s.weight, 0)
  if (!wsum) return { level: 'unknown', ratio: null, signals }
  const ratio = signals.reduce((a, s) => a + s.ratio * s.weight, 0) / wsum
  const level: PerfLevel = ratio >= 1.05 ? 'excellent' : ratio >= 0.92 ? 'good' : ratio >= 0.8 ? 'watch' : 'under'
  return { level, ratio, signals }
}
