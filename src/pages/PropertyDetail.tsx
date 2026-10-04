import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../data/AppContext'
import { Badge, Card, Delta, Field, Icon, Kpi, Modal, PerfBadge, Progress, PropertyImage, Segmented } from '../components/ui'
import { TimeChart, Legend } from '../components/charts/TimeChart'
import { PropertyForm } from '../components/PropertyForm'
import { InvestmentCard } from '../components/InvestmentCard'
import { addDays, addMonths, addYears, endOfMonth, startOfMonth } from '../lib/dates'
import { fmtDate, fmtMonth, fmtMonthShortY, money, nightsLabel, num, pct, pts } from '../lib/format'
import { findGaps, monthSeries, pctChange, rangeMetrics, referenceAdr, type RangeMetrics } from '../lib/metrics'
import { computePerformance } from '../lib/performance'
import { PERIOD_OPTIONS, resolvePeriod, type PeriodKey } from '../lib/periods'
import { useDebounced } from '../components/ui'

export default function PropertyDetail() {
  const { id } = useParams()
  const { an, ds, today, repo, run, refAdr } = useApp()
  const nav = useNavigate()
  const [pk, setPk] = useState<PeriodKey>('12m')
  const [edit, setEdit] = useState(false)
  const [goals, setGoals] = useState(false)
  const p = ds.properties.find((x) => x.id === id)
  const pp = id ? an.props.get(id) : undefined

  const data = useMemo(() => {
    if (!p || !pp) return null
    const period = resolvePeriod(pk, today)
    const cur = rangeMetrics(pp, period.from, period.to)
    const prev = rangeMetrics(pp, period.prevFrom, period.prevTo)
    const months = Array.from({ length: 13 }, (_, i) => addMonths(startOfMonth(today), i - 12 + 1)).slice(-12)
    const series = monthSeries(pp, months)
    // comparaisons mensuelles
    const mFrom = startOfMonth(today)
    const month = rangeMetrics(pp, mFrom, endOfMonth(today))
    const lastMonth = rangeMetrics(pp, addMonths(mFrom, -1), endOfMonth(addMonths(mFrom, -1)))
    const lastYear = rangeMetrics(pp, addYears(mFrom, -1), endOfMonth(addYears(mFrom, -1)))
    const avg12: RangeMetrics = rangeMetrics(pp, addMonths(mFrom, -12), addDays(mFrom, -1))
    const adr = referenceAdr(pp, refAdr, today)
    const gaps = findGaps(pp, today, addDays(today, 90), adr).filter((g) => g.start >= today)
    return { period, cur, prev, months, series, month, lastMonth, lastYear, avg12, gaps, perf: computePerformance(pp, today) }
  }, [p, pp, pk, today, refAdr])

  if (!p || !pp || !data) return <Navigate to="/portfolio" replace />
  const cur = p.currency
  const { cur: m, prev, series } = data
  const target = ds.targets.find((t) => t.property_id === p.id)
  const labels = series.map((s) => fmtMonthShortY(s.from))
  const m12 = data.avg12
  const avg12 = {
    net: m12.net / 12, occupancy: m12.occupancy, adr: m12.adr, profit: m12.profit / 12, revpar: m12.revpar,
  }

  return (
    <div className="page">
      <Link to="/portfolio" className="small muted row" style={{ marginBottom: 12 }}><Icon name="chevL" size={14} />Portfolio</Link>
      <div className="card flush" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,260px) 1fr' }} id="detail-head">
        <div style={{ minHeight: 150 }}><PropertyImage src={p.image_url} name={p.name} /></div>
        <div style={{ padding: 22 }} className="stack-sm">
          <div className="row spread wrap">
            <div>
              <div className="row wrap"><h1>{p.name}</h1><Badge tone={p.active ? 'pos' : undefined}>{p.active ? 'Actif' : 'Inactif'}</Badge><PerfBadge level={data.perf.level} /></div>
              <p className="muted">{[p.city, p.country].filter(Boolean).join(', ')}{p.address ? ` · ${p.address}` : ''}</p>
            </div>
            <div className="row"><button className="btn" onClick={() => setGoals(true)}>Objectifs</button><button className="btn" onClick={() => setEdit(true)}><Icon name="edit" size={14} />Modifier</button></div>
          </div>
          <div className="row wrap muted">
            <span>{p.capacity} voyageurs</span><span>·</span><span>{p.bedrooms} chambre{p.bedrooms > 1 ? 's' : ''}</span><span>·</span><span>Devise {p.currency}</span>
          </div>
          {data.perf.signals.length > 0 && (
            <div className="row wrap small muted">
              {data.perf.signals.map((s) => (
                <span key={s.key} className="badge plain">{s.label} : {s.unit === 'pct' ? pct(s.current, 0) : s.unit === 'money' ? money(s.current, cur) : num(s.current)} <span className="faint">vs {s.unit === 'pct' ? pct(s.baseline, 0) : s.unit === 'money' ? money(s.baseline, cur) : num(s.baseline)}</span></span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="row spread wrap" style={{ margin: '22px 0 14px' }}>
        <h3>Indicateurs</h3>
        <Segmented<PeriodKey> value={pk} onChange={setPk} options={PERIOD_OPTIONS.filter((o) => o.key !== 'custom')} />
      </div>
      <div className="kpis">
        <Kpi label="Revenu brut" value={money(m.gross, cur)} delta={pctChange(m.gross, prev.gross)} hint={data.period.prevLabel} />
        <Kpi label="Revenu net" value={money(m.net, cur)} delta={pctChange(m.net, prev.net)} hint={data.period.prevLabel} />
        <Kpi label="Profit net" value={money(m.profit, cur)} delta={pctChange(m.profit, prev.profit)} hint={`dépenses ${money(m.expenses, cur)}`} />
        <Kpi label="Occupation" value={pct(m.occupancy, 1)} delta={m.occupancy != null && prev.occupancy != null ? m.occupancy - prev.occupancy : null} deltaKind="pts" hint={data.period.prevLabel} />
        <Kpi label="ADR" value={money(m.adr, cur)} delta={pctChange(m.adr, prev.adr)} hint={data.period.prevLabel} />
        <Kpi label="RevPAR" value={money(m.revpar, cur)} delta={pctChange(m.revpar, prev.revpar)} hint={data.period.prevLabel} />
        <Kpi label="Réservations" value={num(m.bookings)} delta={pctChange(m.bookings, prev.bookings)} hint={data.period.prevLabel} />
        <Kpi label="Durée moyenne de séjour" value={m.avgStay ? `${num(m.avgStay, 1)} nuits` : '—'} delta={pctChange(m.avgStay, prev.avgStay)} hint={m.avgLeadTime != null ? `délai moyen ${num(m.avgLeadTime)} j` : undefined} />
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <Card title="Revenus dans le temps" subtitle="Brut et net, par mois" actions={<Legend items={[{ name: 'Brut', color: 'var(--c4)' }, { name: 'Net', color: 'var(--c1)' }]} />}>
          <TimeChart labels={labels} height={240} fmt={(v) => money(v, cur)} axisFmt={(v) => money(v, cur, { compact: true })} series={[{ name: 'Brut', color: 'var(--c4)', values: series.map((s) => s.gross) }, { name: 'Net', color: 'var(--c1)', values: series.map((s) => s.net) }]} />
        </Card>
        <Card title="Occupation dans le temps">
          <TimeChart kind="line" labels={labels} height={240} fmt={(v) => pct(v, 1)} axisFmt={(v) => `${num(v)}%`} reference={target?.occupancy_target ? { value: target.occupancy_target, label: 'Objectif' } : undefined} series={[{ name: 'Occupation', values: series.map((s) => s.occupancy) }]} />
        </Card>
        <Card title="ADR dans le temps">
          <TimeChart kind="line" labels={labels} height={240} fmt={(v) => money(v, cur)} axisFmt={(v) => money(v, cur, { compact: true })} zeroBase={false} reference={target?.adr_target ? { value: target.adr_target, label: 'Objectif' } : undefined} series={[{ name: 'ADR', color: 'var(--c2)', values: series.map((s) => s.adr) }]} />
        </Card>
        <Card title="Profit mensuel" subtitle="Revenu net − dépenses">
          <TimeChart labels={labels} height={240} fmt={(v) => money(v, cur)} axisFmt={(v) => money(v, cur, { compact: true })} series={[{ name: 'Profit', color: 'var(--c2)', values: series.map((s) => s.profit) }]} />
        </Card>
      </div>

      <Card title={`Comparaison — ${fmtMonth(today)}`} subtitle="Mois en cours (nuits confirmées incluses) vs références" className="" >
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Indicateur</th><th className="num">Ce mois</th><th className="num">Mois précédent</th><th className="num">Même mois N-1</th><th className="num">Moyenne 12 derniers mois</th></tr></thead>
            <tbody>
              {([
                ['Revenu net', (x: RangeMetrics) => x.net, (v: number) => money(v, cur), avg12.net],
                ['Profit net', (x: RangeMetrics) => x.profit, (v: number) => money(v, cur), avg12.profit],
                ['Occupation', (x: RangeMetrics) => x.occupancy, (v: number) => pct(v, 1), avg12.occupancy],
                ['ADR', (x: RangeMetrics) => x.adr, (v: number) => money(v, cur), avg12.adr],
                ['RevPAR', (x: RangeMetrics) => x.revpar, (v: number) => money(v, cur), avg12.revpar],
              ] as [string, (x: RangeMetrics) => number | null, (v: number) => string, number | null][]).map(([label, get, f, avg]) => {
                const base = get(data.month)
                const cell = (ref: number | null) => {
                  if (ref == null) return <span className="faint">—</span>
                  const isPct = label === 'Occupation'
                  return <span>{f(ref)} {base != null && <Delta value={isPct ? base - ref : pctChange(base, ref)} kind={isPct ? 'pts' : 'pct'} />}</span>
                }
                return (
                  <tr key={label}>
                    <td><b>{label}</b></td>
                    <td className="num">{base == null ? '—' : f(base)}</td>
                    <td className="num">{cell(get(data.lastMonth))}</td>
                    <td className="num">{cell(get(data.lastYear))}</td>
                    <td className="num">{cell(avg)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="small faint" style={{ marginTop: 10 }}>Les pastilles indiquent l’écart du mois en cours par rapport à chaque référence. Moyenne 12 mois : revenu et profit = moyenne mensuelle.</p>
      </Card>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <Card title="Objectifs du mois" actions={<button className="btn sm" onClick={() => setGoals(true)}>Modifier</button>}>
          {!target ? <p className="muted">Aucun objectif défini.</p> : (
            <div className="stack">
              {target.monthly_revenue_target != null && <Goal label="Revenu net mensuel" value={data.month.net} target={target.monthly_revenue_target} f={(v) => money(v, cur)} />}
              {target.occupancy_target != null && <Goal label="Occupation" value={data.month.occupancy ?? 0} target={target.occupancy_target} f={(v) => pct(v, 0)} />}
              {target.adr_target != null && <Goal label="ADR" value={data.month.adr ?? 0} target={target.adr_target} f={(v) => money(v, cur)} />}
            </div>
          )}
        </Card>
        <Card title="Trous de disponibilité à venir" subtitle="Périodes libres entre deux séjours (90 jours)">
          {data.gaps.length === 0 ? <p className="muted">Aucun trou entre deux séjours dans les 90 prochains jours.</p> : (
            <div className="stack-sm">
              {data.gaps.map((g) => (
                <div key={g.start} className="row spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div><b>{fmtDate(g.start)} → {fmtDate(g.end)}</b><div className="small faint">{nightsLabel(g.nights)} libres</div></div>
                  <div className="right small muted">Potentiel estimé<div><b style={{ color: 'var(--text)' }}>{g.potential != null ? money(g.potential, cur) : '—'}</b></div></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}><InvestmentCard property={p} onEdit={() => setEdit(true)} /></div>

      <div style={{ marginTop: 28 }} className="row">
        <button className="btn danger sm" onClick={() => { if (confirm(`Supprimer « ${p.name} » et toutes ses données ?`)) run(() => repo.deleteProperty(p.id), 'Logement supprimé').then(() => nav('/portfolio')) }}><Icon name="trash" size={14} />Supprimer ce logement</button>
      </div>

      <Modal open={edit} title="Modifier le logement" onClose={() => setEdit(false)}><PropertyForm property={p} onDone={() => setEdit(false)} /></Modal>
      <GoalsModal open={goals} onClose={() => setGoals(false)} propertyId={p.id} currency={cur} />
    </div>
  )
}

function Goal({ label, value, target, f }: { label: string; value: number; target: number; f: (v: number) => string }) {
  const done = value >= target
  return (
    <div className="stack-sm">
      <div className="row spread"><span>{label}</span><span className="small muted"><b style={{ color: 'var(--text)' }}>{f(value)}</b> / {f(target)} · {pct((value / target) * 100, 0)}</span></div>
      <Progress value={value} target={target} tone={done ? 'pos' : undefined} />
    </div>
  )
}

function GoalsModal({ open, onClose, propertyId, currency }: { open: boolean; onClose: () => void; propertyId: string; currency: string }) {
  const { ds, repo, run } = useApp()
  const t = ds.targets.find((x) => x.property_id === propertyId)
  const [rev, setRev] = useState(String(t?.monthly_revenue_target ?? ''))
  const [occ, setOcc] = useState(String(t?.occupancy_target ?? ''))
  const [adr, setAdr] = useState(String(t?.adr_target ?? ''))
  const n = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
  void useDebounced
  return (
    <Modal open={open} title="Objectifs du logement" onClose={onClose}
      footer={<button className="btn primary" onClick={async () => { await run(() => repo.saveTarget({ property_id: propertyId, monthly_revenue_target: n(rev), occupancy_target: n(occ), adr_target: n(adr) }), 'Objectifs enregistrés'); onClose() }}>Enregistrer</button>}>
      <div className="stack">
        <Field label={`Objectif mensuel de revenu net (${currency})`}><input className="input" inputMode="decimal" value={rev} onChange={(e) => setRev(e.target.value)} placeholder="3000" /></Field>
        <Field label="Objectif d’occupation (%)"><input className="input" inputMode="decimal" value={occ} onChange={(e) => setOcc(e.target.value)} placeholder="80" /></Field>
        <Field label={`Objectif d’ADR (${currency})`}><input className="input" inputMode="decimal" value={adr} onChange={(e) => setAdr(e.target.value)} placeholder="130" /></Field>
      </div>
    </Modal>
  )
}
void pts
