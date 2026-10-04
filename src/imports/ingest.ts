import type { Reservation } from '../lib/types'
import type { NormalizedReservation } from './types'

export interface IngestPlan {
  analysed: number
  fresh: (NormalizedReservation & { property_id: string })[]
  duplicates: (NormalizedReservation & { property_id: string })[]
  unmapped: NormalizedReservation[]
}

/**
 * Classe des réservations normalisées : nouvelles / déjà présentes (même logement + même identifiant externe) /
 * sans logement associé. Indépendant de la source (CSV, PMS, webhook…).
 */
export function planIngest(
  rows: NormalizedReservation[],
  existing: Pick<Reservation, 'property_id' | 'external_id'>[],
  resolveProperty: (row: NormalizedReservation) => string | null,
): IngestPlan {
  const have = new Set(existing.filter((e) => e.external_id).map((e) => `${e.property_id}|${e.external_id}`))
  const plan: IngestPlan = { analysed: rows.length, fresh: [], duplicates: [], unmapped: [] }
  for (const r of rows) {
    const property_id = resolveProperty(r)
    if (!property_id) { plan.unmapped.push(r); continue }
    const item = { ...r, property_id }
    if (have.has(`${property_id}|${r.external_id}`)) plan.duplicates.push(item)
    else { plan.fresh.push(item); have.add(`${property_id}|${r.external_id}`) }
  }
  return plan
}
