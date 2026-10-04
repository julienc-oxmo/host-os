import { Fragment, useMemo, useState } from 'react'
import { useApp } from '../data/AppContext'
import { Card, Kpi, Segmented, Select } from '../components/ui'
import { FilterBar, FxBanner, PageHead } from '../components/Layout'
import { TimeChart, Legend } from '../components/charts/TimeChart'
import { Heatmap } from '../components/charts/Heatmap'
import { aggregate, rangeMetrics } from '../lib/metrics'
import { aggregatedMonthSeries, convertibleItems, heatmap, stayBuckets } from '../lib/analytics'
import { addMonths, diffDays, endOfMonth, startOfMonth } from '../lib/dates'
import { fmtMonthShortY, money, num, pct } from '../lib/format'

type Metric = 'occupancy' | 'adr' | 'revpar' | 'net' | 'profit'
type HeatMode = 'occupancy' | 'revenue'

export default function Analytics() {
  const { an, ds, props, display, period, today } = useApp()
  const [metric, setMetric] = useState<Metric>('occupancy')
  const [heatMode, setHeatMode] = useState<HeatMode>('occupancy')
  const [year, setYear] = useState(Number(today.slice(0, 4)))
  const years = useMemo(() => {
    const ys = new Set<number>([Number(today.slice(0, 4))])
    ds.reservations.forEach((r) => { ys.add(Number(r.check_in.slice(0, 4))) })
    return [...ys].sort((a, b) => b - a)
  }, [ds.reservations, today])

  const d = useMemo(() => {
    const cur = aggregate(an, props, display, period.from, period.to)
    const { items, excluded } = convertibleItems(props, (id) => an.props.get(id), an.fx, display)
    const from12 = addMonths(startOfMonth(today), -11)
    const to12 = endOfMonth(today)
    const total = aggregatedMonthSeries(items, from12, to12)
    const perProp = props.map((p) => {
      const pp = an.props.get(p.id)!
      const rate = an.fx.rate(p.currency, display)
      return { p, rate, m: rangeMetrics(pp, period.from, period.to), series: aggregatedMonthSeries([{ pp, rate: rate ?? 1 }], from12, to12) }
    })
    const heat = heatmap(items, year)
    const buckets = stayBuckets(props.map((p) => an.props.get(p.id)!), period.from, period.to)
    const leads = [['0-3 j', 0, 3], ['4-14 j', 4, 14], ['15-30 j', 15, 30], ['31-60 j', 31, 60], ['60 j et +', 61, 9999]].map(([label, lo, hi]) => ({
      label: label as string, n: props.flatMap((p) => an.props.get(p.id)!.active).filter((r) => r.booking_date && r.check_in >= period.from && r.check_in <= period.to && diffDays(r.booking_date, r.check_in) >= (lo as number) && diffDays(r.booking_date, r.check_in) <= (hi as number)).length,
    }))
    return { cur, excluded, total, perProp, heat, buckets, leads, months: diffDays(period.from, period.to) / 30.4 }
  }, [an, props, display, period, today, year])

  const m = d.cur.m
  const labels = d.total.map((x) => fmtMonthShortY(x.month))
  const metricDef: Record<Metric, { label: string; get: (x: (typeof d.total)[number]) => number | null; fmt: (v: number) => string; axis: (v: number) => string }> = {
    occupancy: { label: 'Occupation', get: (x) => x.occupancy, fmt: (v) => pct(v, 1), axis: (v) => `${num(v)}%` },
    adr: { label: 'ADR', get: (x) => x.adr, fmt: (v) => money(v, display), axis: (v) => money(v, display, { compact: true }) },
    revpar: { label: 'RevPAR', get: (x) => x.revpar, fmt: (v) => money(v, display), axis: (v) => money(v, display, { compact: true }) },
    net: { label: 'Revenu net', get: (x) => x.net, fmt: (v) => money(v, display), axis: (v) => money(v, display, { compact: true }) },
    profit: { label: 'Profit net', get: (x) => x.profit, fmt: (v) => money(v, display), axis: (v) => money(v, display, { compact: true }) },
  }
  const md = metricDef[metric]
  const maxLead = Math.max(1, ...d.leads.map((l) => l.n))
  const bestBucket = d.buckets.filter((b) => b.bookings >= 3 && b.adr != null).sort((a, b) => b.adr! - a.adr!)[0]

  return (
    <div className="page">
      <PageHead title="Analytics" subtitle="Comprendre ce qui fait performer — ou non — vos logements." />
      <FilterBar />
      <FxBanner excluded={d.excluded} />
      <div className="kpis">
        <Kpi label="Durée moyenne de séjour" value={m.avgStay ? `${num(m.avgStay, 1)} nuits` : '—'} hint="nuits / séjour" />
        <Kpi label="Délai de réservation" info="Check-in − date de réservation, en moyenne." value={m.avgLeadTime != null ? `${num(m.avgLeadTime, 0)} jours` : '—'} hint="entre réservation et arrivée" />
        <Kpi label="Nuits réservées / mois" value={num(m.reservedNights / Math.max(1, d.months), 1)} hint="en moyenne sur la période" />
        <Kpi label="Revenu moyen / réservation" value={money(m.avgRevenuePerBooking, display)} hint="net" />
        <Kpi label="Revenu net / logement" value={money(d.cur.included.length ? m.net / d.cur.included.length : null, display)} hint={`${d.cur.included.length} logement${d.cur.included.length > 1 ? 's' : ''}`} />
        <Kpi label="Profit net / logement" value={money(d.cur.included.length ? m.profit / d.cur.included.length : null, display)} hint="après dépenses" />
      </div>

      <Card title="Indicateurs mensuels" subtitle="12 derniers mois — tous les logements filtrés" actions={<Segmented<Metric> value={metric} onChange={setMetric} options={(Object.keys(metricDef) as Metric[]).map((k) => ({ key: k, label: metricDef[k].label }))} />} className="">
        <TimeChart kind={metric === 'occupancy' || metric === 'adr' || metric === 'revpar' ? 'line' : 'bar'} labels={labels} height={270} fmt={md.fmt} axisFmt={md.axis}
          zeroBase={metric !== 'adr'} series={[{ name: md.label, values: d.total.map(md.get), dashedFrom: d.total.length - 1 }]} />
      </Card>

      {props.length > 1 && (
        <div className="grid cols-main" style={{ marginTop: 16 }}>
          <Card title="Comparaison des logements" subtitle={`${metricDef[metric].label}, 12 mois`} actions={<Legend items={d.perProp.map((x, i) => ({ name: x.p.name, color: `var(--c${(i % 4) + 1})` }))} />}>
            {metric === 'adr' || metric === 'net' || metric === 'profit' || metric === 'revpar' ? (
              d.perProp.every((x) => x.rate != null) ? null : <p className="small faint" style={{ marginBottom: 8 }}>Les montants sont convertis en {display} ; les logements sans taux sont tracés en devise native.</p>
            ) : null}
            <TimeChart kind="line" labels={labels} height={260} fmt={md.fmt} axisFmt={md.axis} zeroBase={metric !== 'adr'}
              series={d.perProp.map((x, i) => ({ name: x.p.name, color: `var(--c${(i % 4) + 1})`, values: x.series.map(md.get) }))} />
          </Card>
          <Card title="Tableau comparatif" subtitle="Période sélectionnée, devises natives" flush>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Logement</th><th className="num">Occ.</th><th className="num">ADR</th><th className="num">RevPAR</th><th className="num">Net</th><th className="num">Profit</th></tr></thead>
              <tbody>{d.perProp.map(({ p, m: x }) => (
                <tr key={p.id}><td><b>{p.name}</b></td><td className="num">{pct(x.occupancy, 0)}</td><td className="num">{money(x.adr, p.currency)}</td><td className="num">{money(x.revpar, p.currency)}</td><td className="num">{money(x.net, p.currency)}</td><td className="num">{money(x.profit, p.currency)}</td></tr>
              ))}</tbody></table></div>
          </Card>
        </div>
      )}

      <Card title="Heatmap annuelle" subtitle="Mois × jour de la semaine : repérez saisonnalité, meilleurs jours et meilleurs mois."
        actions={<><Segmented<HeatMode> value={heatMode} onChange={setHeatMode} options={[{ key: 'occupancy', label: 'Occupation' }, { key: 'revenue', label: 'Revenu' }]} />
          <Select value={String(year)} onChange={(v) => setYear(Number(v))} options={years.map((y) => ({ key: String(y), label: String(y) }))} /></>} className="">
        <div style={{ marginTop: 0 }}>
          <Heatmap year={year}
            values={d.heat.map((col) => col.map((c) => (heatMode === 'occupancy' ? c.occupancy : c.available ? c.revenue : null)))}
            fmt={heatMode === 'occupancy' ? (v) => pct(v, 0) : (v) => money(v, display)} cellFmt={heatMode === 'occupancy' ? (v) => `${Math.round(v)}` : (v) => money(v, display, { compact: true })} />
        </div>
        <p className="small faint" style={{ marginTop: 12 }}>{heatMode === 'occupancy' ? 'Part des nuits disponibles réservées, par mois et jour de la semaine (nuit commençant ce jour-là).' : `Revenu hébergement brut cumulé en ${display} (nuits de la semaine concernée).`}</p>
      </Card>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <Card title="Revenu par durée de séjour" subtitle={bestBucket ? `ADR le plus élevé : ${bestBucket.label} (${money(bestBucket.adr, display === 'EUR' ? 'EUR' : display)})` : 'Période sélectionnée'} flush>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Durée</th><th className="num">Séjours</th><th className="num">ADR</th><th className="num">Net moyen / séjour</th></tr></thead>
            <tbody>{d.buckets.map((b) => <tr key={b.label}><td>{b.label}</td><td className="num">{b.bookings}</td><td className="num">{b.adr != null ? num(b.adr) : '—'}</td><td className="num">{b.avgNet != null ? num(b.avgNet) : '—'}</td></tr>)}</tbody></table></div>
          <p className="small faint" style={{ padding: '10px 14px 14px' }}>Montants dans la devise native de chaque réservation (non convertis).</p>
        </Card>
        <Card title="Délai entre réservation et arrivée" subtitle="Nombre de séjours par délai">
          <div className="stack-sm">
            {d.leads.map((l) => (
              <Fragment key={l.label}><div className="row spread small"><span>{l.label}</span><span className="muted">{l.n}</span></div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(l.n / maxLead) * 100}%` }} /></div></Fragment>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
