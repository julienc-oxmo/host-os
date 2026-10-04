import { useMemo, useState } from 'react'
import { useApp } from '../data/AppContext'
import { Card, Kpi, Segmented, Select, Callout } from '../components/ui'
import { FilterBar, FxBanner, PageHead } from '../components/Layout'
import { TimeChart, Legend } from '../components/charts/TimeChart'
import { Waterfall } from '../components/charts/Waterfall'
import { RefAdrPicker } from '../components/RefAdrPicker'
import { aggregate, rangeMetrics, pctChange } from '../lib/metrics'
import { aggregatedMonthSeries, convertibleItems, waterfall } from '../lib/analytics'
import { opportunityFor } from '../lib/opportunity'
import { computeForecast } from '../lib/forecast'
import { addDays, addMonths, endOfMonth, startOfMonth } from '../lib/dates'
import { fmtMonth, fmtMonthShortY, money, nightsLabel, num, pct } from '../lib/format'

type View = 'month' | 'property' | 'year'

export default function Revenues() {
  const { an, ds, props, display, period, today, refAdr, repo, run } = useApp()
  const [view, setView] = useState<View>('month')
  const [oppMonth, setOppMonth] = useState<string>('period')
  const win = ds.profile.settings.forecast_window_months ?? 6

  const d = useMemo(() => {
    const cur = aggregate(an, props, display, period.from, period.to)
    const prev = aggregate(an, props, display, period.prevFrom, period.prevTo)
    const { items } = convertibleItems(props, (id) => an.props.get(id), an.fx, display)
    const wf = waterfall(items, period.from, period.to)
    const months = aggregatedMonthSeries(items, addMonths(startOfMonth(today), -11), endOfMonth(today))
    const firstYear = Math.min(Number(today.slice(0, 4)), ...ds.reservations.map((r) => Number(r.check_in.slice(0, 4))))
    const years = Array.from({ length: Number(today.slice(0, 4)) - firstYear + 1 }, (_, i) => firstYear + i).reverse().map((y) => ({
      y, m: aggregate(an, props, display, `${y}-01-01`, `${y}-12-31`).m,
    }))
    const perProp = props.map((p) => ({ p, m: rangeMetrics(an.props.get(p.id)!, period.from, period.to) }))
    const monthOpts = Array.from({ length: 12 }, (_, i) => addMonths(startOfMonth(today), -i))
    const oFrom = oppMonth === 'period' ? period.from : oppMonth
    const oTo = oppMonth === 'period' ? period.to : endOfMonth(oppMonth)
    const opp = opportunityFor(an, props, display, oFrom, oTo, refAdr)
    const oppSeries = monthOpts.slice().reverse().map((m) => ({ m, o: opportunityFor(an, props, display, m, endOfMonth(m), refAdr).total }))
    const forecast = computeForecast(an, props, display, win)
    return { cur, prev, wf, months, years, perProp, monthOpts, opp, oppSeries, forecast }
  }, [an, props, display, period, today, ds.reservations, refAdr, oppMonth, win])

  const f = (v: number) => money(v, display)
  const m = d.cur.m
  const maxH = Math.max(...d.forecast.points.map((p) => p.expectedTotal), 1)

  return (
    <div className="page">
      <PageHead title="Revenus" subtitle="Du revenu brut au profit net, et ce qui reste à capter." />
      <FilterBar />
      <FxBanner excluded={d.cur.excluded} />
      <div className="kpis">
        <Kpi label="Revenus bruts" value={f(m.gross)} delta={pctChange(m.gross, d.prev.m.gross)} hint={period.prevLabel} />
        <Kpi label="Frais plateforme" value={f(m.fees)} delta={pctChange(m.fees, d.prev.m.fees)} invert hint={m.gross ? `${pct((m.fees / m.gross) * 100, 1)} du brut` : undefined} />
        <Kpi label="Revenus nets" value={f(m.net)} delta={pctChange(m.net, d.prev.m.net)} hint={period.prevLabel} />
        <Kpi label="Dépenses" value={f(m.expenses)} delta={pctChange(m.expenses, d.prev.m.expenses)} invert hint={period.prevLabel} />
        <Kpi label="Profit net" value={f(m.profit)} delta={pctChange(m.profit, d.prev.m.profit)} hint={m.net ? `marge ${pct((m.profit / m.net) * 100, 0)}` : undefined} />
      </div>

      <div className="grid cols-main" style={{ marginTop: 16 }}>
        <Card title="Du brut au profit net" subtitle="Cascade sur la période sélectionnée">
          <Waterfall steps={d.wf.steps} fmt={(v) => money(v, display, { compact: Math.abs(v) >= 10000 })} />
        </Card>
        <Card title="Lecture" subtitle="Où part le revenu ?">
          <dl className="kv">
            {d.wf.steps.map((s) => <><dt key={s.key + 'l'}>{s.label}</dt><dd key={s.key + 'v'}>{f(s.value)}</dd></>)}
          </dl>
          <p className="small faint" style={{ marginTop: 12 }}>Charges = assurance, internet, électricité, copropriété, consommables, autres. Maintenance inclut les meubles.</p>
        </Card>
      </div>

      <Card title="Détail" actions={<Segmented<View> value={view} onChange={setView} options={[{ key: 'month', label: 'Par mois' }, { key: 'property', label: 'Par logement' }, { key: 'year', label: 'Par année' }]} />} flush className="">
        <div style={{ padding: '0 20px 8px' }}>
          {view === 'month' && (
            <>
              <TimeChart labels={d.months.map((x) => fmtMonthShortY(x.month))} height={220} fmt={f} axisFmt={(v) => money(v, display, { compact: true })}
                series={[{ name: 'Net', color: 'var(--c1)', values: d.months.map((x) => x.net) }, { name: 'Profit', color: 'var(--c2)', values: d.months.map((x) => x.profit) }]} />
              <Legend items={[{ name: 'Net', color: 'var(--c1)' }, { name: 'Profit', color: 'var(--c2)' }]} />
            </>
          )}
        </div>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="table">
            <thead><tr><th>{view === 'month' ? 'Mois' : view === 'property' ? 'Logement' : 'Année'}</th><th className="num">Revenus bruts</th><th className="num">Frais plateforme</th><th className="num">Revenus nets</th><th className="num">Dépenses</th><th className="num">Profit net</th></tr></thead>
            <tbody>
              {view === 'month' && d.months.slice().reverse().map((x) => (
                <tr key={x.month}><td style={{ textTransform: 'capitalize' }}>{fmtMonth(x.month)}</td><td className="num">{f(x.gross)}</td><td className="num">{f(x.fees)}</td><td className="num">{f(x.net)}</td><td className="num">{f(x.expenses)}</td><td className="num"><b>{f(x.profit)}</b></td></tr>
              ))}
              {view === 'property' && d.perProp.map(({ p, m: pm }) => (
                <tr key={p.id}><td><b>{p.name}</b> <span className="faint small">{p.currency}</span></td><td className="num">{money(pm.gross, p.currency)}</td><td className="num">{money(pm.fees, p.currency)}</td><td className="num">{money(pm.net, p.currency)}</td><td className="num">{money(pm.expenses, p.currency)}</td><td className="num"><b>{money(pm.profit, p.currency)}</b></td></tr>
              ))}
              {view === 'year' && d.years.map(({ y, m: ym }) => (
                <tr key={y}><td>{y}{String(y) === today.slice(0, 4) ? ' (en cours)' : ''}</td><td className="num">{f(ym.gross)}</td><td className="num">{f(ym.fees)}</td><td className="num">{f(ym.net)}</td><td className="num">{f(ym.expenses)}</td><td className="num"><b>{f(ym.profit)}</b></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {view === 'property' && d.cur.included.length > 1 && <p className="small faint" style={{ padding: '10px 20px 16px' }}>Chaque ligne est dans la devise du logement. Total consolidé en {display} : {f(m.net)} de revenus nets, {f(m.profit)} de profit.</p>}
      </Card>

      <section style={{ marginTop: 28 }} className="stack">
        <div className="row spread wrap">
          <div><h2 style={{ fontSize: 19 }}>Revenue Opportunity</h2><p className="muted small">Revenu potentiel estimé = revenu réalisé + (nuits disponibles non vendues × ADR de référence). Une estimation, jamais une perte certaine.</p></div>
          <div className="row wrap"><RefAdrPicker />
            <Select value={oppMonth} onChange={setOppMonth} ariaLabel="Mois" options={[{ key: 'period', label: 'Période sélectionnée' }, ...d.monthOpts.map((x) => ({ key: x, label: fmtMonth(x) }))]} /></div>
        </div>
        <FxBanner excluded={d.opp.excluded} />
        <div className="grid cols-3">
          <Kpi label="Revenu réalisé" value={f(d.opp.total.realized)} hint="revenu hébergement brut" />
          <Kpi label="Revenu potentiel estimé" value={f(d.opp.total.potential)} hint={`${nightsLabel(d.opp.total.unsoldNights)} non vendues`} />
          <Kpi label="Opportunité non captée (estimée)" value={<span style={{ color: 'var(--accent-text)' }}>{f(d.opp.total.uncaptured)}</span>} hint="revenu non capté estimé" />
        </div>
        <div className="grid cols-main">
          <Card title="Par mois" subtitle="Réalisé vs opportunité estimée (12 mois)" actions={<Legend items={[{ name: 'Réalisé', color: 'var(--c1)' }, { name: 'Opportunité estimée', color: 'var(--c3)' }]} />}>
            <TimeChart labels={d.oppSeries.map((x) => fmtMonthShortY(x.m))} height={240} fmt={f} axisFmt={(v) => money(v, display, { compact: true })}
              series={[{ name: 'Réalisé', color: 'var(--c1)', values: d.oppSeries.map((x) => x.o.realized) }, { name: 'Opportunité', color: 'var(--c3)', values: d.oppSeries.map((x) => x.o.uncaptured) }]} />
          </Card>
          <Card title="Par logement" flush>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Logement</th><th className="num">Réalisé</th><th className="num">Potentiel</th><th className="num">Non capté</th></tr></thead>
              <tbody>{d.opp.rows.map((r) => (
                <tr key={r.property.id}><td><b>{r.property.name}</b><div className="small faint">{nightsLabel(r.unsoldNights)} · ADR réf. {money(r.adr, r.property.currency)}</div></td>
                  <td className="num">{money(r.realized, r.property.currency)}</td><td className="num">{money(r.potential, r.property.currency)}</td><td className="num"><b>{money(r.uncaptured, r.property.currency)}</b></td></tr>
              ))}</tbody></table></div>
          </Card>
        </div>
      </section>

      <section style={{ marginTop: 28 }} className="stack">
        <div className="row spread wrap">
          <div><h2 style={{ fontSize: 19 }}>Prévisions</h2><p className="muted small">Le confirmé vient de vos réservations. La projection est une estimation séparée, basée sur une moyenne historique.</p></div>
          <div className="row"><span className="small muted">Moyenne historique</span>
            <Segmented<string> value={String(win)} onChange={(v) => run(() => repo.saveProfile({ settings: { ...ds.profile.settings, forecast_window_months: Number(v) as 3 | 6 | 12 } }))} options={[{ key: '3', label: '3 mois' }, { key: '6', label: '6 mois' }, { key: '12', label: '12 mois' }]} /></div>
        </div>
        <FxBanner excluded={d.forecast.excluded} />
        <Card>
          <div className="stack">
            {d.forecast.points.map((p) => (
              <div key={p.horizon} className="stack-sm">
                <div className="row spread wrap">
                  <b>{p.horizon} prochains jours</b>
                  <span className="small muted">Confirmé <b style={{ color: 'var(--text)' }}>{f(p.confirmed)}</b> · Projection estimée <b style={{ color: 'var(--text)' }}>+{f(p.estimated)}</b> · {nightsLabel(p.freeNights)} libres</span>
                </div>
                <div className="stack-bar" style={{ width: `${(p.expectedTotal / maxH) * 100}%`, minWidth: 40 }}>
                  <div style={{ width: `${p.expectedTotal ? (p.confirmed / p.expectedTotal) * 100 : 0}%`, background: 'var(--accent)' }} title="Revenu confirmé" />
                  <div className="hatch" style={{ flex: 1 }} title="Projection estimée (non confirmée)" />
                </div>
              </div>
            ))}
            <div className="row wrap small muted" style={{ gap: 18 }}>
              <span className="row" style={{ gap: 6 }}><i style={{ width: 14, height: 10, borderRadius: 3, background: 'var(--accent)' }} />Revenus confirmés (net)</span>
              <span className="row" style={{ gap: 6 }}><i className="hatch" style={{ width: 14, height: 10, borderRadius: 3 }} />Projection estimée</span>
              {d.forecast.dailyAvg != null && <span>Moyenne historique : {f(d.forecast.dailyAvg * 30)} / 30 jours</span>}
            </div>
            {d.forecast.dailyAvg == null && <Callout tone="info">Pas assez d’historique pour estimer une projection : seuls les revenus confirmés sont affichés.</Callout>}
          </div>
        </Card>
      </section>
      <span className="faint" style={{ display: 'none' }}>{num(0)}{addDays(today, 0)}</span>
    </div>
  )
}
