import { addDays, addMonths, addYears, diffDays, endOfMonth, startOfMonth } from './dates'

export type PeriodKey = 'this_month' | 'last_month' | '3m' | '6m' | '12m' | 'year' | 'custom'

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'this_month', label: 'Ce mois' },
  { key: 'last_month', label: 'Mois précédent' },
  { key: '3m', label: '3 mois' },
  { key: '6m', label: '6 mois' },
  { key: '12m', label: '12 mois' },
  { key: 'year', label: 'Année' },
  { key: 'custom', label: 'Personnalisé' },
]

export interface Period {
  key: PeriodKey
  from: string
  to: string
  prevFrom: string
  prevTo: string
  prevLabel: string
  note: string
}

export interface CustomRange { from: string; to: string }

/**
 * - Ce mois / mois précédent : mois calendaire complet (« ce mois » inclut les nuits déjà confirmées à venir)
 * - 3 / 6 / 12 mois : fenêtre glissante qui se termine aujourd'hui
 * - Année : du 1er janvier à aujourd'hui
 * La période précédente a toujours la même durée et la précède (ou, pour l'année, la même période N-1).
 */
export function resolvePeriod(key: PeriodKey, today: string, custom?: CustomRange): Period {
  let from: string
  let to: string
  let prevFrom: string
  let prevTo: string
  let prevLabel = 'vs période précédente'
  let note = ''
  switch (key) {
    case 'this_month':
      from = startOfMonth(today)
      to = endOfMonth(today)
      prevFrom = addMonths(from, -1)
      prevTo = endOfMonth(prevFrom)
      prevLabel = 'vs mois précédent'
      note = 'Inclut les nuits déjà confirmées jusqu’à la fin du mois.'
      break
    case 'last_month':
      from = addMonths(startOfMonth(today), -1)
      to = endOfMonth(from)
      prevFrom = addMonths(from, -1)
      prevTo = endOfMonth(prevFrom)
      prevLabel = 'vs mois d’avant'
      break
    case '3m':
    case '6m':
    case '12m': {
      const n = Number(key.replace('m', ''))
      to = today
      from = addDays(addMonths(today, -n), 1)
      const len = diffDays(from, to) + 1
      prevTo = addDays(from, -1)
      prevFrom = addDays(prevTo, -(len - 1))
      note = `Fenêtre glissante des ${n} derniers mois.`
      break
    }
    case 'year':
      from = today.slice(0, 4) + '-01-01'
      to = today
      prevFrom = addYears(from, -1)
      prevTo = addYears(to, -1)
      prevLabel = 'vs même période N-1'
      note = 'Du 1er janvier à aujourd’hui.'
      break
    default: {
      from = custom?.from ?? startOfMonth(today)
      to = custom?.to ?? today
      if (to < from) [from, to] = [to, from]
      const len = diffDays(from, to) + 1
      prevTo = addDays(from, -1)
      prevFrom = addDays(prevTo, -(len - 1))
    }
  }
  return { key, from, to, prevFrom, prevTo, prevLabel, note }
}
