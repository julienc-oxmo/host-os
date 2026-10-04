import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../data/AppContext'
import { Badge, Card, Delta, Kpi, PerfBadge, Progress, Segmented } from '../components/ui'
import { FilterBar, FxBanner, PageHead } from '../components/Layout'
import { TimeChart } from '../components/charts/TimeChart'
import { Sparkline } from '../components/charts/Sparkline'
import { RefAdrPicker } from '../components/RefAdrPicker'
import { aggregate, freeNights, monthSeries, pctChange, ptsChange, rangeMetrics, referenceAdr } from '../lib/metrics'
import { aggregatedMonthSeries, convertibleItems } from '../lib/analytics'
import { computePerformance } from '../lib/performance'
import { opportunityFor } from '../lib/opportunity'
import { computeForecast } from '../lib/forecast'
import { generateInsights } from '../lib/insights'
import { addDays, addMonths, endOfMonth, startOfMonth } from '../lib/dates'
import { fmtMonth, fmtMonthShort, money, nightsLabel, num, pct, fmtDate } from '../lib/format'
import { SEVERITY_LABELS } from '../lib/alerts'

type ChartMode = 'gross' | 'net' | 'profit' | 'occupancy'

export default function Dashboard() {
  const { an, ds, props, display, period, today, refAdr, repo } = useApp()
  const [mode, setMode] = useState<ChartMode>('net')
  const { alerts } = useApp()

  const d = useMemo(() => {
    const cur = aggregate(an, props, display, period.from, period.to)
    const prev = aggregate(an, props, display, period.prevFrom, period.prevTo)
    const future = aggregate(an, props, display, today, addDays(today, 365))
    const next30 = aggregate(an, props, display, today, addDays(today, 29))
    const monthFrom = startOfMonth(today)
    const mFrom = addMonths(monthFrom, -11)
    const { items } = convertibleItems(props, (id) => an.props.get(id), an.fx, display)
    const series = aggregatedMonthSeries(items, mFrom, endOfMonth(today))
    const opp = opportunityFor(an, props, display, monthFrom, endOfMonth(today), refAdr)
    const forecast = computeForecast(an, props, display, ds.profile.settings.forecast_window_months ?? 6)
    const rows = props.map((p) => {
      const pp = an.props.get(p.id)!
      return {
        p, perf: computePerformance(pp, today), m: rangeMetrics(pp, period.from, period.to),
        spark: monthSeries(pp, series.map((s) => s.month)).map((x) => x.net),
        free30: freeNights(pp, today, addDays(today, 29)),
      }
    })
    const next30Free = rows.reduce((a, r) => a + r.free30, 0)
    const adrOpp = props.reduce((a, p) => {
      const pp = an.props.get(p.id)!
      const adr = referenceAdr(pp, refAdr, today)
      const rate = an.fx.rate(p.currency, display)
      return adr != null && rate != null ? a + freeNights(pp, today, addDays(today, 29)) * adr * rate : a
    }, 0)
    return { cur, prev, future, next30, series, opp, forecast, rows, next30Free, adrOpp }
  }, [an, props, display, period, today, refAdr, ds])

  const insights = useMemo(() => generateInsights(ds, an, refAdr).slice(0, 3), [ds, an, refAdr])
  const attention = alerts.filter((a) => !a.read).sort((a, b) => ['important', 'watch', 'info'].indexOf(a.severity) - ['important', 'watch', 'info'].indexOf(b.severity)).slice(0, 4)
  const { cur, prev } = d
  const label = d.series.map((s) => fmtMonthShort(s.month))
  const chart = {
    gross: { name: 'Revenu brut', v: d.series.map((s) => s.gross), fmt: (v: number) => money(v, display) },
    net: { name: 'Revenu net', v: d.series.map((s) => s.net), fmt: (v: number) => money(v, display) },
    profit: { name: 'Profit net', v: d.series.map((s) => s.profit), fmt: (v: number) => money(v, display) },
    occupancy: { name: 'Occupation', v: d.series.map((s) => s.occupancy), fmt: (v: number) => pct(v, 1) },
  }[mode]
  const goalRows = props.map((p) => ({ p, t: ds.targets.find((t) => t.property_id === p.id), m: rangeMetrics(an.props.get(p.id)!, startOfMonth(today), endOfMonth(today)) })).filter((r) => r.t?.monthly_revenue_target)
  const name = repo.mode === 'local' ? null : ds.profile.display_name

  return (
    <div className="page">
      <PageHead title={name ? `Bonjour ${name}` : 'Dashboard'} subtitle={`${props.length} logement${props.length > 1 ? 's' : ''} · ${fmtDate(today, true)}`} />
      <FilterBar />
      <FxBanner excluded={cur.excluded} />

      <div className="hero">
        <div className="card kpi big hero-main">
          <div className="label">Revenu net</div>
          <div className="value">{money(cur.m.net, display)}</div>
          <div className="row wrap"><Delta value={pctChange(cur.m.net, prev.m.net)} /><span className="hint">{period.prevLabel}</span></div>
          <div className="hint" style={{ marginTop: 6 }}>Profit net après dépenses : <b style={{ color: 'inherit' }}>{money(cur.m.profit, display)}</b></div>
        </div>
        <Kpi big label="Revenu futur sécurisé" info="Réservations confirmées dont les nuits sont à venir (revenu net)." value={money(d.future.m.net, display)}
          hint={`${nightsLabel(d.future.m.reservedNights)} confirmées · 30 j : ${money(d.forecast.points[0].confirmed, display)}`} />
        <Kpi big label="Nuits encore libres (30 jours)" value={num(d.next30Free)}
          hint={d.adrOpp > 0 ? `Revenu potentiel estimé : ${money(d.adrOpp, display)}` : 'sur les 30 prochains jours'} />
      </div>

      <div className="kpis" style={{ marginTop: 14 }}>
        <Kpi label="Taux d’occupation" value={pct(cur.m.occupancy, 1)} delta={ptsChange(cur.m.occupancy, prev.m.occupancy)} deltaKind="pts" hint={period.prevLabel} />
        <Kpi label="ADR" info="Average Daily Rate : revenu hébergement brut / nuits vendues." value={money(cur.m.adr, display)} delta={pctChange(cur.m.adr, prev.m.adr)} hint={period.prevLabel} />
        <Kpi label="RevPAR" info="Revenue Per Available Room : revenu brut / nuits disponibles." value={money(cur.m.revpar, display)} delta={pctChange(cur.m.revpar, prev.m.revpar)} hint={period.prevLabel} />
        <Kpi label="Profit net" value={money(cur.m.profit, display)} delta={pctChange(cur.m.profit, prev.m.profit)} hint={`dépenses ${money(cur.m.expenses, display)}`} />
        <Kpi label="Nuits réservées" value={num(cur.m.reservedNights)} delta={pctChange(cur.m.reservedNights, prev.m.reservedNights)} hint={`sur ${num(cur.m.availableNights)} disponibles`} />
        <Kpi label="Réservations" value={num(cur.m.bookings)} delta={pctChange(cur.m.bookings, prev.m.bookings)} hint={cur.m.avgStay ? `séjour moyen ${num(cur.m.avgStay, 1)} nuits` : undefined} />
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <Card title="Évolution sur 12 mois" subtitle="Le dernier mois inclut les nuits déjà confirmées à venir."
          actions={<Segmented<ChartMode> value={mode} onChange={setMode} options={[{ key: 'gross', label: 'Brut' }, { key: 'net', label: 'Net' }, { key: 'profit', label: 'Profit' }, { key: 'occupancy', label: 'Occupation' }]} />}>
          <TimeChart labels={label} series={[{ name: chart.name, values: chart.v, dashedFrom: chart.v.length - 1 }]} fmt={chart.fmt}
            axisFmt={mode === 'occupancy' ? (v) => `${num(v)}%` : (v) => money(v, display, { compact: true })} kind={mode === 'occupancy' ? 'line' : 'bar'} height={280} />
        </Card>
      </div>

      <div className="grid cols-main" style={{ marginTop: 16 }}>
        <Card title="Vos logements" subtitle="Performance comparée à l’historique propre de chaque logement" actions={<Link className="btn sm" to="/portfolio">Tout voir</Link>} flush>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead><tr><th>Logement</th><th>Performance</th><th className="num">Occupation</th><th className="num">Revenu net</th><th>12 mois</th></tr></thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.p.id}>
                    <td><Link to={`/portfolio/${r.p.id}`}><b>{r.p.name}</b><div className="small faint">{r.p.city}</div></Link></td>
                    <td><PerfBadge level={r.perf.level} /></td>
                    <td className="num">{pct(r.m.occupancy, 0)}</td>
                    <td className="num">{money(r.m.net, r.p.currency)}</td>
                    <td><Sparkline values={r.spark} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="À surveiller" subtitle="Alertes et observations calculées sur vos données" actions={<Link className="btn sm" to="/insights">Insights</Link>}>
          <div className="stack-sm">
            {attention.length === 0 && insights.length === 0 && <p className="muted">Rien à signaler : tout est calme.</p>}
            {attention.map((a) => (
              <div className="alert-item" key={a.id} style={{ padding: '8px 0' }}>
                <span className={`sev ${a.severity}`} />
                <div className="grow"><div className="small faint">{SEVERITY_LABELS[a.severity]} · {ds.properties.find((p) => p.id === a.property_id)?.name ?? 'Portfolio'}</div>{a.message}</div>
              </div>
            ))}
            {insights.slice(0, attention.length ? 1 : 3).map((i) => (
              <div className="alert-item" key={i.id} style={{ padding: '8px 0' }}><span className="sev info" /><div className="grow">{i.observation}</div></div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <Card title="Revenue Opportunity" subtitle={`${fmtMonth(today)} — estimation, pas une perte certaine`} actions={<RefAdrPicker />}>
          <div className="stack">
            <dl className="kv">
              <dt>Revenu réalisé</dt><dd>{money(d.opp.total.realized, display)}</dd>
              <dt>Revenu potentiel estimé</dt><dd>{money(d.opp.total.potential, display)}</dd>
              <dt>Opportunité non captée (estimée)</dt><dd style={{ color: 'var(--accent-text)' }}>{money(d.opp.total.uncaptured, display)}</dd>
            </dl>
            <div className="stack-bar" title="Réalisé vs potentiel">
              <div style={{ width: `${d.opp.total.potential ? (d.opp.total.realized / d.opp.total.potential) * 100 : 0}%`, background: 'var(--accent)' }} />
              <div className="hatch" style={{ flex: 1 }} />
            </div>
            <p className="small faint">{nightsLabel(d.opp.total.unsoldNights)} disponibles non vendues × ADR de référence propre à chaque logement. <Link to="/revenus" style={{ textDecoration: 'underline' }}>Détail</Link></p>
          </div>
        </Card>
        <Card title="Objectifs du mois" subtitle="Revenu net (confirmé inclus) vs objectif">
          {goalRows.length === 0 ? <p className="muted">Définissez des objectifs depuis la fiche d’un logement.</p> : (
            <div className="stack">
              {goalRows.map((r) => (
                <div key={r.p.id} className="stack-sm">
                  <div className="row spread"><b>{r.p.name}</b><span className="small muted">{money(r.m.net, r.p.currency)} / {money(r.t!.monthly_revenue_target, r.p.currency)}</span></div>
                  <Progress value={r.m.net} target={r.t!.monthly_revenue_target!} tone={r.m.net >= r.t!.monthly_revenue_target! ? 'pos' : undefined} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <p className="small faint" style={{ marginTop: 18 }}>
        Tous les chiffres sont calculés à partir de vos réservations et dépenses ; les montants en devises différentes ne sont consolidés que si un taux de change est renseigné.
        {' '}<Badge plain>{display}</Badge>
      </p>
    </div>
  )
}
