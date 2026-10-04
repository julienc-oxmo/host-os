import { type Analytics, opportunity, referenceAdr } from './metrics'
import type { Currency, Property, RefAdr } from './types'

export interface OpportunityRow {
  property: Property
  realized: number
  potential: number
  uncaptured: number
  unsoldNights: number
  adr: number | null // dans la devise d'origine du logement
}

/**
 * Revenue Opportunity = nuits disponibles non vendues × ADR de référence (30 j / 90 j / annuel).
 * Chaque logement garde son propre ADR de référence ; les montants sont convertis pour le total
 * uniquement si un taux est renseigné. Résultat présenté comme une estimation, jamais comme une perte certaine.
 */
export function opportunityFor(an: Analytics, props: Property[], display: Currency, from: string, to: string, ref: RefAdr) {
  const rows: OpportunityRow[] = []
  const excluded: Property[] = []
  const total = { realized: 0, potential: 0, uncaptured: 0, unsoldNights: 0 }
  for (const p of props) {
    const pp = an.props.get(p.id)
    if (!pp) continue
    const adr = referenceAdr(pp, ref, an.today)
    const o = opportunity(pp, from, to, adr)
    rows.push({ property: p, realized: o.realized, potential: o.potential, uncaptured: o.uncaptured, unsoldNights: o.unsoldNights, adr })
    const rate = an.fx.rate(p.currency, display)
    if (rate == null) { excluded.push(p); continue }
    total.realized += o.realized * rate
    total.potential += o.potential * rate
    total.uncaptured += o.uncaptured * rate
    total.unsoldNights += o.unsoldNights
  }
  return { rows, total, excluded }
}
