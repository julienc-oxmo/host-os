import { addDays, addMonths, endOfMonth, startOfMonth } from './dates'
import { money, nightsLabel, num, pct, pts } from './format'
import {
  type Analytics, type PreparedProperty, findGaps, freeNights, pctChange, rangeMetrics, referenceAdr,
} from './metrics'
import { stayBuckets } from './analytics'
import type { Dataset, Property, RefAdr, Severity } from './types'

/** Un insight sépare toujours : observation (chiffrée), hypothèse (jamais présentée comme une cause) et action possible. */
export interface Insight {
  id: string
  propertyId: string | null
  severity: Severity
  topic: 'occupation' | 'disponibilité' | 'prix' | 'comparaison' | 'séjours' | 'trous' | 'délai' | 'coûts' | 'objectif'
  observation: string
  hypothesis?: string
  action?: string
  link?: { to: string; label: string }
}

const SEV_ORDER: Record<Severity, number> = { important: 0, watch: 1, info: 2 }

export function generateInsights(ds: Dataset, an: Analytics, refAdr: RefAdr): Insight[] {
  const out: Insight[] = []
  const today = an.today
  const monthFrom = startOfMonth(today)
  const monthTo = endOfMonth(today)
  const sixFrom = addMonths(monthFrom, -6)
  const sixTo = addDays(monthFrom, -1)
  const active = ds.properties.filter((p) => p.active)

  for (const p of active) {
    const pp = an.props.get(p.id)
    if (!pp) continue
    const cur = p.currency
    const label = `« ${p.name} »`

    /* 1 — Occupation du mois vs moyenne 6 mois */
    const month = rangeMetrics(pp, monthFrom, monthTo)
    const six = rangeMetrics(pp, sixFrom, sixTo)
    if (month.occupancy != null && six.occupancy != null && six.availableNights >= 60) {
      const diff = month.occupancy - six.occupancy
      if (Math.abs(diff) >= 8) {
        const incomplete = today < monthTo
        out.push({
          id: `occ-${p.id}`,
          propertyId: p.id,
          topic: 'occupation',
          severity: diff <= -15 ? 'watch' : 'info',
          observation: `Ton logement ${label} affiche ${pct(month.occupancy)} d’occupation ce mois-ci contre ${pct(six.occupancy)} en moyenne sur les 6 derniers mois (${pts(diff)}).`,
          hypothesis:
            diff < 0
              ? incomplete
                ? 'Le mois n’est pas terminé : une partie des nuits peut encore être réservée. Les données ne permettent pas de dire si l’écart est durable.'
                : 'Le prix, la saison ou la concurrence peuvent jouer, mais les données ne suffisent pas à le confirmer.'
              : 'Il peut s’agir d’un effet de saison ; les données ne permettent pas de l’affirmer.',
          action: diff < 0 ? 'Comparer ADR et occupation avec les 3 mois précédents dans Analytics.' : 'Vérifier que l’ADR suit : une forte occupation peut aussi indiquer une marge de prix.',
          link: { to: `/analytics`, label: 'Ouvrir Analytics' },
        })
      }
    }

    /* 2 — Nuits libres dans les 21 prochains jours */
    const free21 = freeNights(pp, today, addDays(today, 20))
    if (free21 >= 3) {
      const adr = referenceAdr(pp, refAdr, today)
      const lastMinute = lastMinuteShare(pp, today)
      out.push({
        id: `free21-${p.id}`,
        propertyId: p.id,
        topic: 'disponibilité',
        severity: free21 >= 12 ? 'watch' : 'info',
        observation: `Tu as ${nightsLabel(free21)} encore disponibles dans les 21 prochains jours sur ${label}${adr ? ` (revenu potentiel estimé : ${money(free21 * adr, cur)})` : ''}.`,
        hypothesis:
          lastMinute != null
            ? `${pct(lastMinute)} des séjours des 12 derniers mois ont été réservés moins de 7 jours avant l’arrivée : une partie de ces nuits peut encore se vendre à court terme.`
            : undefined,
        action: 'Vérifier tarifs, durée minimale et ouverture du calendrier sur ces dates.',
        link: { to: '/calendrier', label: 'Voir le calendrier' },
      })
    }

    /* 3 — ADR vs occupation (30 derniers jours vs 30 précédents) */
    const r30 = rangeMetrics(pp, addDays(today, -29), today)
    const p30 = rangeMetrics(pp, addDays(today, -59), addDays(today, -30))
    const adrCh = pctChange(r30.adr, p30.adr)
    if (adrCh != null && r30.occupancy != null && p30.occupancy != null) {
      const occDiff = r30.occupancy - p30.occupancy
      const revparCh = pctChange(r30.revpar, p30.revpar)
      if ((adrCh >= 8 && occDiff <= -5) || (adrCh <= -8 && occDiff >= 5)) {
        const up = adrCh > 0
        out.push({
          id: `adr-occ-${p.id}`,
          propertyId: p.id,
          topic: 'prix',
          severity: 'info',
          observation: `Sur ${label}, ton ADR est en ${up ? 'hausse' : 'baisse'} de ${num(Math.abs(adrCh))} %, mais ton taux d’occupation ${up ? 'baisse' : 'progresse'} de ${num(Math.abs(occDiff))} points (30 derniers jours vs 30 précédents).${revparCh != null ? ` Au final, le RevPAR ${Math.abs(revparCh) < 1 ? 'reste stable' : `varie de ${revparCh > 0 ? '+' : '−'}${num(Math.abs(revparCh))} %`}.` : ''}`,
          hypothesis: 'Le prix peut coïncider avec le niveau d’occupation, mais la saison, des événements locaux ou l’offre concurrente peuvent aussi jouer ; rien ne permet de le confirmer ici.',
          action: 'Comparer le RevPAR des deux périodes plutôt que l’ADR seul pour juger si le nouveau niveau de prix est rentable.',
          link: { to: `/portfolio/${p.id}`, label: 'Voir le logement' },
        })
      }
    }

    /* 5 — Durée de séjour la plus rémunératrice */
    const buckets = stayBuckets([pp], addMonths(today, -12), today)
    const totalB = buckets.reduce((a, b) => a + b.bookings, 0)
    const overallAdr = buckets.reduce((a, b) => a + b.nights, 0) ? buckets.reduce((a, b) => a + b.gross, 0) / buckets.reduce((a, b) => a + b.nights, 0) : null
    const ranked = buckets.filter((b) => b.bookings >= 4 && b.adr != null).sort((a, b) => b.adr! - a.adr!)
    if (totalB >= 12 && overallAdr && ranked[0] && ranked[0].adr! >= overallAdr * 1.05) {
      const b = ranked[0]
      out.push({
        id: `stay-${p.id}`,
        propertyId: p.id,
        topic: 'séjours',
        severity: 'info',
        observation: `Sur ${label}, les séjours de ${b.label} semblent générer le meilleur revenu par nuit : ADR de ${money(b.adr, cur)} contre ${money(overallAdr, cur)} tous séjours confondus (${b.bookings} séjours, 12 derniers mois).`,
        hypothesis: 'L’écart peut venir de la saison ou du type de voyageurs autant que de la durée du séjour.',
        action: 'Si tu souhaites tester, ajuster la durée minimale sur quelques dates et comparer le résultat.',
        link: { to: '/analytics', label: 'Voir Analytics' },
      })
    }

    /* 6 — Petits trous entre séjours (≤ 2 nuits) à venir */
    const adr = referenceAdr(pp, refAdr, today)
    const smallGaps = findGaps(pp, today, addDays(today, 59), adr).filter((g) => g.nights <= 2 && g.start >= today)
    if (smallGaps.length >= 2) {
      const potential = smallGaps.reduce((a, g) => a + (g.potential ?? 0), 0)
      out.push({
        id: `gaps-${p.id}`,
        propertyId: p.id,
        topic: 'trous',
        severity: 'info',
        observation: `${smallGaps.length} trous de 1 à 2 nuits entre deux séjours sont ouverts dans les 60 prochains jours sur ${label}${potential ? ` (revenu potentiel estimé : ${money(potential, cur)})` : ''}.`,
        hypothesis: 'Les séjours très courts sont parfois plus difficiles à vendre ; les données seules ne permettent pas de le confirmer.',
        action: 'Réduire la durée minimale ou proposer un tarif adapté sur ces dates, puis suivre le résultat.',
        link: { to: '/calendrier', label: 'Voir les trous' },
      })
    }

    /* 7 — Délai de réservation */
    const l90 = rangeMetrics(pp, addDays(today, -89), today)
    const lPrev = rangeMetrics(pp, addDays(today, -179), addDays(today, -90))
    if (l90.avgLeadTime != null && lPrev.avgLeadTime != null && l90.leadCount >= 5 && lPrev.leadCount >= 5) {
      const d = l90.avgLeadTime - lPrev.avgLeadTime
      if (Math.abs(d) >= 5) {
        out.push({
          id: `lead-${p.id}`,
          propertyId: p.id,
          topic: 'délai',
          severity: 'info',
          observation: `Sur ${label}, le délai moyen entre réservation et arrivée est de ${num(l90.avgLeadTime)} jours sur 90 jours, contre ${num(lPrev.avgLeadTime)} jours sur les 90 jours précédents.`,
          hypothesis: d < 0 ? 'Les voyageurs réservent plus près de la date ; cela peut être lié à la saison.' : 'Les voyageurs réservent plus tôt ; cela peut être lié à la saison ou à des événements.',
          action: d < 0 ? 'Garder les tarifs des dates proches à jour.' : 'Surveiller les tarifs des dates lointaines.',
        })
      }
    }

    /* 8 — Poids des dépenses */
    const e90 = rangeMetrics(pp, addDays(today, -89), today)
    const e365 = rangeMetrics(pp, addDays(today, -454), addDays(today, -90))
    if (e90.net > 0 && e365.net > 0) {
      const r1 = (e90.expenses / e90.net) * 100
      const r0 = (e365.expenses / e365.net) * 100
      if (r1 - r0 >= 8) {
        out.push({
          id: `cost-${p.id}`,
          propertyId: p.id,
          topic: 'coûts',
          severity: 'watch',
          observation: `Sur ${label}, les dépenses représentent ${pct(r1)} du revenu net sur les 90 derniers jours, contre ${pct(r0)} sur la période précédente.`,
          hypothesis: 'Une dépense ponctuelle (travaux, mobilier) ou un revenu plus bas peut expliquer l’écart ; la liste des dépenses permet de le vérifier.',
          action: 'Passer en revue les dépenses récentes de ce logement.',
          link: { to: '/depenses', label: 'Voir les dépenses' },
        })
      }
    }

    /* 10 — Objectif mensuel */
    const t = ds.targets.find((x) => x.property_id === p.id)
    if (t?.monthly_revenue_target) {
      const ratio = (month.net / t.monthly_revenue_target) * 100
      out.push({
        id: `goal-${p.id}`,
        propertyId: p.id,
        topic: 'objectif',
        severity: 'info',
        observation: `Sur ${label}, le revenu net du mois (confirmé inclus) est de ${money(month.net, cur)}, soit ${pct(ratio)} de l’objectif de ${money(t.monthly_revenue_target, cur)}.`,
        action: ratio < 100 ? `Il reste ${nightsLabel(Math.max(0, month.availableNights - month.reservedNights))} à vendre ce mois-ci.` : 'Objectif atteint : le surplus peut servir de base pour l’objectif suivant.',
        link: { to: `/portfolio/${p.id}`, label: 'Voir les objectifs' },
      })
    }
  }

  /* 4 — Comparaison de RevPAR entre logements (uniquement si les devises sont convertibles) */
  if (active.length >= 2) {
    const items = active
      .map((p) => {
        const pp = an.props.get(p.id)
        const rate = an.fx.rate(p.currency, an.main)
        if (!pp || rate == null) return null
        const m = rangeMetrics(pp, addDays(today, -29), today)
        return m.revpar != null ? { p, revpar: m.revpar * rate } : null
      })
      .filter(Boolean) as { p: Property; revpar: number }[]
    items.sort((a, b) => b.revpar - a.revpar)
    if (items.length >= 2 && items[0].revpar >= items[items.length - 1].revpar * 1.1) {
      const hi = items[0]
      const lo = items[items.length - 1]
      out.push({
        id: 'revpar-compare',
        propertyId: null,
        topic: 'comparaison',
        severity: 'info',
        observation: `Le logement ${hi.p.name} génère actuellement davantage de RevPAR que ${lo.p.name} (${money(hi.revpar, an.main)} contre ${money(lo.revpar, an.main)} par nuit disponible, 30 derniers jours).`,
        hypothesis: 'Les marchés, les capacités et les saisons diffèrent : l’écart n’indique pas à lui seul quel logement est mieux géré.',
        action: 'Comparer l’évolution de chaque logement par rapport à son propre historique (page Portfolio).',
        link: { to: '/portfolio', label: 'Voir le portfolio' },
      })
    }
  }

  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
}

/** Part des séjours (12 derniers mois) réservés moins de 7 jours avant l'arrivée. */
export function lastMinuteShare(pp: PreparedProperty, today: string): number | null {
  const from = addMonths(today, -12)
  const rows = pp.active.filter((r) => r.check_in >= from && r.check_in <= today && r.booking_date)
  if (rows.length < 8) return null
  const lm = rows.filter((r) => (Date.parse(r.check_in) - Date.parse(r.booking_date!)) / 86_400_000 < 7).length
  return (lm / rows.length) * 100
}
