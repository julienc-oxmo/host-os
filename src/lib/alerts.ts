import { addDays, endOfMonth, startOfMonth } from './dates'
import { money, nightsLabel, num, pct } from './format'
import { type Analytics, freeNights, pctChange, rangeMetrics } from './metrics'
import type { Dataset, Severity } from './types'

export interface ComputedAlert {
  dedupe_key: string
  property_id: string | null
  type: string
  severity: Severity
  message: string
}

export const SEVERITY_LABELS: Record<Severity, string> = { info: 'Info', watch: 'À surveiller', important: 'Important' }

/**
 * Alertes factuelles et sobres. Chaque règle part d'une donnée mesurée ; aucune ne sous-entend de cause.
 * Les clés de dédoublonnage sont mensuelles : une alerte lue ne revient pas à chaque recalcul.
 */
export function computeAlerts(ds: Dataset, an: Analytics): ComputedAlert[] {
  const out: ComputedAlert[] = []
  const today = an.today
  const month = today.slice(0, 7)
  const push = (a: Omit<ComputedAlert, 'dedupe_key'> & { key?: string }) =>
    out.push({ ...a, dedupe_key: `${a.type}:${a.property_id ?? 'all'}:${a.key ?? month}` })

  for (const p of ds.properties.filter((x) => x.active)) {
    const pp = an.props.get(p.id)
    if (!pp) continue

    const free14 = freeNights(pp, today, addDays(today, 13))
    const next21 = rangeMetrics(pp, today, addDays(today, 20))
    if (next21.reservedNights === 0 && next21.availableNights > 0 && pp.active.length > 0) {
      push({ property_id: p.id, type: 'no_booking_21d', severity: 'important', message: 'Aucune réservation sur les 21 prochains jours.' })
    } else if (free14 >= 7) {
      push({ property_id: p.id, type: 'free_nights_14d', severity: 'watch', message: `${nightsLabel(free14)} libres dans les 14 prochains jours.` })
    }

    const recent = rangeMetrics(pp, addDays(today, -29), today)
    const base = rangeMetrics(pp, addDays(today, -30 - 364), addDays(today, -30))
    if (base.availableNights >= 90 && recent.occupancy != null && base.occupancy) {
      const rel = (recent.occupancy / base.occupancy - 1) * 100
      if (rel <= -20)
        push({
          property_id: p.id, type: 'occupancy_low', severity: rel <= -40 ? 'important' : 'watch',
          message: `Taux d’occupation inférieur de ${num(Math.abs(rel))} % à la moyenne habituelle (${pct(recent.occupancy)} contre ${pct(base.occupancy)}).`,
        })
      const adrCh = pctChange(recent.adr, base.adr)
      if (adrCh != null && adrCh <= -15)
        push({ property_id: p.id, type: 'adr_down', severity: 'watch', message: `ADR en baisse de ${num(Math.abs(adrCh))} % vs la moyenne habituelle (${money(recent.adr, p.currency)} contre ${money(base.adr, p.currency)}).` })
    }

    const prev = rangeMetrics(pp, addDays(today, -59), addDays(today, -30))
    const revCh = pctChange(recent.net, prev.net)
    if (revCh != null && revCh <= -25 && prev.net > 0)
      push({ property_id: p.id, type: 'revenue_down', severity: 'watch', message: `Revenus en baisse de ${num(Math.abs(revCh))} % vs les 30 jours précédents.` })

    // Profit du mois : on attend le 10 du mois pour éviter un faux signal dû aux charges fixes prélevées en début de mois.
    const m = rangeMetrics(pp, startOfMonth(today), endOfMonth(today))
    if (m.profit < 0 && (Number(today.slice(8)) >= 10 || today === endOfMonth(today)))
      push({ property_id: p.id, type: 'profit_negative', severity: 'important', message: `Profit net négatif ce mois-ci (${money(m.profit, p.currency)}).` })
  }

  // Alerte d'information : devises sans taux de change (les totaux multi-devises sont alors partiels)
  const currencies = new Set(ds.properties.map((p) => p.currency))
  for (const c of currencies)
    if (c !== an.main && an.fx.rate(c, an.main) == null)
      push({ property_id: null, type: `fx_missing_${c}`, severity: 'info', key: 'static', message: `Aucun taux ${c} → ${an.main} renseigné : les totaux du portfolio n’incluent pas les logements en ${c}.` })

  return out
}
