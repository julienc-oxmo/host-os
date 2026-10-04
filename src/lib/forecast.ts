import { addDays, diffDays } from './dates'
import { aggregate, type Analytics } from './metrics'
import type { Currency, Property } from './types'

export interface ForecastPoint {
  horizon: 30 | 60 | 90
  confirmed: number // revenu net déjà confirmé (réservations existantes)
  confirmedNights: number
  estimated: number // projection supplémentaire estimée (moyenne historique) — jamais confirmée
  expectedTotal: number
  freeNights: number
}

/**
 * Revenus confirmés = nuits déjà réservées dans les N prochains jours (données réelles).
 * Projection estimée = max(0, moyenne journalière nette des `windowMonths` derniers mois × N − confirmé).
 * La projection n'est jamais mélangée au confirmé.
 */
export function computeForecast(
  an: Analytics,
  props: Property[],
  display: Currency,
  windowMonths: number,
): { points: ForecastPoint[]; dailyAvg: number | null; excluded: Property[] } {
  const today = an.today
  const histFrom = addDays(today, -Math.round(windowMonths * 30.4))
  const hist = aggregate(an, props, display, histFrom, addDays(today, -1))
  const histDays = diffDays(histFrom, addDays(today, -1)) + 1
  const histOk = hist.m.availableNights > 0
  const dailyAvg = histOk ? hist.m.net / histDays : null
  const points = ([30, 60, 90] as const).map((h) => {
    const to = addDays(today, h - 1)
    const fut = aggregate(an, props, display, today, to)
    const expected = dailyAvg != null ? dailyAvg * h : fut.m.net
    return {
      horizon: h,
      confirmed: fut.m.net,
      confirmedNights: fut.m.reservedNights,
      estimated: Math.max(0, expected - fut.m.net),
      expectedTotal: Math.max(expected, fut.m.net),
      freeNights: fut.m.availableNights - fut.m.reservedNights,
    }
  })
  return { points, dailyAvg, excluded: hist.excluded }
}
