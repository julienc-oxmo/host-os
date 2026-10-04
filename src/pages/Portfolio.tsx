import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../data/AppContext'
import { Badge, Card, Icon, Modal, PerfBadge, PropertyImage } from '../components/ui'
import { FilterBar, FxBanner, PageHead } from '../components/Layout'
import { PropertyForm } from '../components/PropertyForm'
import { addDays, addYears, endOfMonth, startOfMonth } from '../lib/dates'
import { fmtDate, money, nightsLabel, pct } from '../lib/format'
import { freeNights, nextReservation, rangeMetrics } from '../lib/metrics'
import { computePerformance } from '../lib/performance'

export default function Portfolio() {
  const { an, ds, props, today, filters } = useApp()
  const [open, setOpen] = useState(false)
  const list = useMemo(() => {
    const show = filters.propertyId === 'all' ? ds.properties.filter((p) => props.includes(p) || !p.active) : props
    return show.map((p) => {
      const pp = an.props.get(p.id)!
      const month = rangeMetrics(pp, startOfMonth(today), endOfMonth(today))
      const year = rangeMetrics(pp, addDays(addYears(today, -1), 1), today)
      const l90 = rangeMetrics(pp, addDays(today, -89), today)
      return { p, month, year, l90, perf: computePerformance(pp, today), next: nextReservation(pp, today), free30: freeNights(pp, today, addDays(today, 29)) }
    })
  }, [an, ds, props, today, filters.propertyId])

  return (
    <div className="page">
      <PageHead title="Portfolio" subtitle="Tous vos logements, comparés à leur propre historique." actions={<button className="btn primary" onClick={() => setOpen(true)}><Icon name="plus" size={15} />Ajouter un logement</button>} />
      <FilterBar showPeriod={false} />
      <FxBanner excluded={[]} />
      <div className="grid cols-3">
        {list.map(({ p, month, year, l90, perf, next, free30 }) => (
          <Link to={`/portfolio/${p.id}`} key={p.id} className="card pcard hoverable" style={{ opacity: p.active ? 1 : 0.65 }}>
            <div className="pimg-wrap" style={{ position: 'relative' }}>
              <PropertyImage src={p.image_url} name={p.name} />
              <div style={{ position: 'absolute', top: 12, left: 12 }}>{p.active ? <PerfBadge level={perf.level} /> : <Badge>Inactif</Badge>}</div>
            </div>
            <div className="pbody">
              <div>
                <h3>{p.name}</h3>
                <div className="small muted">{[p.city, p.country].filter(Boolean).join(', ')} · {p.currency}</div>
              </div>
              <div className="pstats">
                <div className="stat"><div className="k">Revenu du mois</div><div className="v">{money(month.net, p.currency)}</div></div>
                <div className="stat"><div className="k">Revenu annuel</div><div className="v">{money(year.net, p.currency)}</div></div>
                <div className="stat"><div className="k">Occupation (90 j)</div><div className="v">{pct(l90.occupancy, 0)}</div></div>
                <div className="stat"><div className="k">ADR (90 j)</div><div className="v">{money(l90.adr, p.currency)}</div></div>
                <div className="stat"><div className="k">Profit net du mois</div><div className="v" style={{ color: month.profit < 0 ? 'var(--neg)' : undefined }}>{money(month.profit, p.currency)}</div></div>
                <div className="stat"><div className="k">Libres (30 j)</div><div className="v">{nightsLabel(free30)}</div></div>
              </div>
              <div className="pfoot">
                <div><span className="faint">Prochaine réservation · </span>{next ? `${fmtDate(next.check_in)} → ${fmtDate(next.check_out)} (${nightsLabel(next.nights)})` : 'Aucune à venir'}</div>
                {perf.signals.length > 0 && <div className="faint">{perf.signals.slice(0, 2).map((s) => `${s.label} ${s.unit === 'pct' ? pct(s.current, 0) : s.unit === 'money' ? money(s.current, p.currency) : Math.round(s.current)} vs ${s.unit === 'pct' ? pct(s.baseline, 0) : s.unit === 'money' ? money(s.baseline, p.currency) : Math.round(s.baseline)}`).join(' · ')}</div>}
              </div>
            </div>
          </Link>
        ))}
      </div>
      <Card className="" subtitle={undefined}>
        <p className="small muted"><b>Comment est calculée la performance ?</b> Les 30 derniers jours d’un logement sont comparés à sa moyenne des 12 mois précédents sur 5 signaux : occupation, RevPAR, revenu net, ADR, nuits vacantes. Un ratio ≥ 1,05 = Excellent · ≥ 0,92 = Bon · ≥ 0,80 = À surveiller · en dessous = Sous-performance. Aucune note arbitraire.</p>
      </Card>
      <Modal open={open} title="Nouveau logement" onClose={() => setOpen(false)}><PropertyForm onDone={() => setOpen(false)} /></Modal>
    </div>
  )
}
