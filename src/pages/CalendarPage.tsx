import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../data/AppContext'
import { Badge, Callout, Card, Icon, Modal, Segmented } from '../components/ui'
import { FilterBar, PageHead } from '../components/Layout'
import { RefAdrPicker } from '../components/RefAdrPicker'
import { useWidth } from '../components/charts/useSize'
import { addDays, addMonths, daysInMonth, diffDays, endOfMonth, fromDay, monthsBetween, startOfMonth, toDay, weekday } from '../lib/dates'
import { fmtDate, fmtMonth, money, nightsLabel } from '../lib/format'
import { findGaps, rangeMetrics, referenceAdr, type Gap } from '../lib/metrics'
import { CHANNEL_LABELS, STATUS_LABELS, type Property, type Reservation } from '../lib/types'

type View = 'month' | '3m' | 'year'
const LABEL_W = 170

export default function CalendarPage() {
  const { an, ds, props, today, refAdr } = useApp()
  const [view, setView] = useState<View>('month')
  const [anchor, setAnchor] = useState(startOfMonth(today))
  const [res, setRes] = useState<{ r: Reservation; p: Property } | null>(null)
  const [gap, setGap] = useState<{ g: Gap; p: Property } | null>(null)
  const [ref, width] = useWidth<HTMLDivElement>()

  const months = view === 'month' ? 1 : view === '3m' ? 3 : 12
  const start = anchor
  const end = endOfMonth(addMonths(anchor, months - 1))
  const days = diffDays(start, end) + 1
  const s0 = toDay(start)
  const minCw = view === 'month' ? 30 : view === '3m' ? 11 : 4
  const mobile = width < 640
  const labelW = mobile ? 110 : LABEL_W
  const cw = Math.max(minCw, (width - labelW - 2) / days)
  const trackW = cw * days
  const x = (d: number) => (d - s0) * cw
  const clip = (a: number, b: number) => [Math.max(0, a), Math.min(trackW, b)] as const

  const rows = useMemo(() => props.map((p) => {
    const pp = an.props.get(p.id)!
    const adr = referenceAdr(pp, refAdr, today)
    return {
      p, adr, m: rangeMetrics(pp, start, end),
      res: pp.active.filter((r) => r.check_out > start && r.check_in <= end),
      events: ds.calendarEvents.filter((e) => e.property_id === p.id && e.event_type !== 'available' && e.end_date > start && e.start_date <= end),
      gaps: findGaps(pp, start, end, adr),
    }
  }), [props, an, ds.calendarEvents, start, end, refAdr, today])

  const allGaps = rows.flatMap((r) => r.gaps.map((g) => ({ g, p: r.p }))).sort((a, b) => a.g.start.localeCompare(b.g.start))
  const monthList = monthsBetween(start, end)
  const step = view === 'month' ? 1 : view === '3m' ? 3 : 12
  const todayX = today >= start && today <= end ? x(toDay(today)) + cw / 2 : null

  return (
    <div className="page">
      <PageHead title="Calendrier" subtitle="Nuits réservées, bloquées et trous de disponibilité, logement par logement." />
      <FilterBar showPeriod={false} />
      <div className="row spread wrap" style={{ marginBottom: 14 }}>
        <div className="row">
          <button className="btn icon-btn" onClick={() => setAnchor(addMonths(anchor, -step))} aria-label="Précédent"><Icon name="chevL" /></button>
          <button className="btn icon-btn" onClick={() => setAnchor(addMonths(anchor, step))} aria-label="Suivant"><Icon name="chevR" /></button>
          <button className="btn" onClick={() => setAnchor(startOfMonth(today))}>Aujourd’hui</button>
          <b style={{ textTransform: 'capitalize', marginLeft: 6 }}>{view === 'month' ? fmtMonth(start) : `${fmtMonth(start)} → ${fmtMonth(end)}`}</b>
        </div>
        <Segmented<View> value={view} onChange={setView} options={[{ key: 'month', label: 'Mois' }, { key: '3m', label: '3 mois' }, { key: 'year', label: 'Année' }]} />
      </div>
      <div className="row wrap small muted" style={{ marginBottom: 10, gap: 16 }}>
        <span className="row" style={{ gap: 6 }}><i style={{ width: 14, height: 10, borderRadius: 3, background: 'var(--accent)' }} />Réservé</span>
        <span className="row" style={{ gap: 6 }}><i style={{ width: 14, height: 10, borderRadius: 3, background: 'color-mix(in srgb, var(--accent) 78%, var(--surface))' }} />À venir</span>
        <span className="row" style={{ gap: 6 }}><i style={{ width: 14, height: 10, borderRadius: 3, background: 'repeating-linear-gradient(45deg, var(--surface-3) 0 3px, var(--surface-2) 3px 6px)' }} />Bloqué</span>
        <span className="row" style={{ gap: 6 }}><i style={{ width: 14, height: 10, borderRadius: 3, background: 'repeating-linear-gradient(135deg, var(--c4) 0 3px, #bbb 3px 6px)' }} />Réservé (iCal)</span>
        <span className="row" style={{ gap: 6 }}><i style={{ width: 14, height: 10, borderRadius: 3, border: '1.5px dashed var(--c3)' }} />Trou de disponibilité</span>
        <span className="faint">Une barre commence à midi le jour du check-in et finit à midi le jour du check-out.</span>
      </div>

      <div className="card flush">
        <div className="cal" ref={ref}>
          <div className="cal-inner" style={{ width: labelW + trackW }}>
            <div className="cal-row cal-head" style={{ background: 'var(--surface)' }}>
              <div className="cal-label" style={{ width: labelW, borderBottom: 0 }}><span className="small faint">{days} jours</span></div>
              <div className="cal-track" style={{ width: trackW, height: 46 }}>
                {view === 'month'
                  ? Array.from({ length: days }, (_, i) => {
                      const d = fromDay(s0 + i)
                      const we = weekday(d) >= 5
                      return <div key={i} className={`cal-day ${we ? 'we' : ''} ${d === today ? 'today' : ''}`} style={{ left: i * cw, width: cw }}><b>{i + 1}</b>{'LMMJVSD'[weekday(d)]}</div>
                    })
                  : monthList.map((m) => <div key={m} className="cal-month" style={{ left: x(toDay(m)), width: daysInMonth(m) * cw }}>{view === '3m' ? fmtMonth(m) : fmtMonth(m).split(' ')[0].slice(0, 4)}</div>)}
              </div>
            </div>
            {rows.map(({ p, m, res: rs, events, gaps }) => (
              <div className="cal-row cal-body" key={p.id}>
                <div className="cal-label" style={{ width: labelW }}>
                  <Link to={`/portfolio/${p.id}`} style={{ fontWeight: 600 }}>{p.name}</Link>
                  <span className="small faint" style={{ lineHeight: 1.35 }}>{m.reservedNights} réservées · {Math.max(0, m.availableNights - m.reservedNights)} libres{m.blockedNights ? ` · ${m.blockedNights} bloquées` : ''}</span>
                </div>
                <div className="cal-track" style={{ width: trackW }}>
                  {view === 'month' && Array.from({ length: days }, (_, i) => weekday(fromDay(s0 + i)) >= 5 && <div key={i} className="cal-day we" style={{ left: i * cw, width: cw, top: 0, bottom: 0 }} />)}
                  {events.map((e) => {
                    const [a, b] = clip(x(toDay(e.start_date)), x(toDay(e.end_date)))
                    return b > a && <div key={e.id} className={`cal-bar ${e.event_type === 'blocked' ? 'blocked' : 'ical'}`} style={{ left: a, width: b - a - 1 }} title={`${e.event_type === 'blocked' ? 'Bloqué' : 'Réservé (iCal)'} · ${fmtDate(e.start_date)} → ${fmtDate(e.end_date)}`}>{b - a > 60 && (e.event_type === 'blocked' ? 'Bloqué' : 'iCal')}</div>
                  })}
                  {gaps.map((g) => {
                    const [a, b] = clip(x(toDay(g.start)) + cw / 2, x(toDay(g.end)) + cw / 2)
                    return b > a && <button key={g.start} className="cal-gap" style={{ left: a + 1, width: b - a - 2 }} onClick={() => setGap({ g, p })} title={`Trou de disponibilité · ${nightsLabel(g.nights)}`}>{b - a > 44 ? `${g.nights} n.` : ''}</button>
                  })}
                  {rs.map((r) => {
                    const [a, b] = clip(x(toDay(r.check_in)) + cw / 2, x(toDay(r.check_out)) + cw / 2)
                    return b > a && <button key={r.id} className={`cal-bar ${r.check_in > today ? 'future' : ''}`} style={{ left: a + 1, width: b - a - 2 }} onClick={() => setRes({ r, p })} title={`${r.guest_name} · ${fmtDate(r.check_in)} → ${fmtDate(r.check_out)}`}>{b - a > 54 ? r.guest_name : ''}</button>
                  })}
                  {todayX != null && <div className="cal-today" style={{ left: todayX }} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="row spread wrap" style={{ margin: '26px 0 12px' }}>
        <div><h3>Trous de disponibilité</h3><p className="small muted">Périodes libres entre deux séjours sur la période affichée. Le potentiel est une estimation basée sur l’ADR récent — pas un revenu certain.</p></div>
        <RefAdrPicker />
      </div>
      {allGaps.length === 0 ? <Card><p className="muted">Aucun trou entre deux séjours sur cette période.</p></Card> : (
        <div className="grid cols-3">
          {allGaps.map(({ g, p }) => (
            <button key={p.id + g.start} className="card hoverable" style={{ textAlign: 'left' }} onClick={() => setGap({ g, p })}>
              <div className="small faint">Trou de disponibilité</div>
              <b>{p.name}</b>
              <div style={{ marginTop: 6 }}>{fmtDate(g.start)} → {fmtDate(g.end)}</div>
              <div className="row spread" style={{ marginTop: 8 }}>
                <Badge tone="warn" plain>{nightsLabel(g.nights)} libres</Badge>
                <span className="small muted">Potentiel estimé <b style={{ color: 'var(--text)' }}>{g.potential != null ? money(g.potential, p.currency) : '—'}</b></span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!res} title="Réservation" onClose={() => setRes(null)}>
        {res && (
          <dl className="kv">
            <dt>Voyageur</dt><dd>{res.r.guest_name ?? '—'}</dd>
            <dt>Logement</dt><dd>{res.p.name}</dd>
            <dt>Check-in</dt><dd>{fmtDate(res.r.check_in, true)}</dd>
            <dt>Check-out</dt><dd>{fmtDate(res.r.check_out, true)}</dd>
            <dt>Durée</dt><dd>{nightsLabel(res.r.nights)}</dd>
            <dt>Revenu brut</dt><dd>{money(res.r.gross_revenue, res.r.currency, { decimals: 2 })}</dd>
            <dt>Frais plateforme</dt><dd>{money(res.r.platform_fee, res.r.currency, { decimals: 2 })}</dd>
            <dt>Revenu net</dt><dd>{money(res.r.net_revenue, res.r.currency, { decimals: 2 })}</dd>
            <dt>Canal</dt><dd>{CHANNEL_LABELS[res.r.channel] ?? res.r.channel}</dd>
            <dt>Statut</dt><dd>{STATUS_LABELS[res.r.status]}</dd>
            <dt>Réservée le</dt><dd>{fmtDate(res.r.booking_date, true)}</dd>
          </dl>
        )}
      </Modal>
      <Modal open={!!gap} title="Trou de disponibilité" onClose={() => setGap(null)}>
        {gap && (
          <div className="stack">
            <div><b>{gap.p.name}</b><div style={{ fontSize: 18, marginTop: 4 }}>{fmtDate(gap.g.start)} → {fmtDate(gap.g.end)}</div><div className="muted">{nightsLabel(gap.g.nights)} libres</div></div>
            <dl className="kv">
              <dt>Séjour précédent</dt><dd>{gap.g.before ? `${gap.g.before.guest_name} (départ ${fmtDate(gap.g.before.check_out)})` : 'iCal'}</dd>
              <dt>Séjour suivant</dt><dd>{gap.g.after ? `${gap.g.after.guest_name} (arrivée ${fmtDate(gap.g.after.check_in)})` : 'iCal'}</dd>
              <dt>ADR de référence</dt><dd>{referenceAdr(an.props.get(gap.p.id)!, refAdr, today) != null ? money(referenceAdr(an.props.get(gap.p.id)!, refAdr, today), gap.p.currency) : '—'}</dd>
              <dt>Potentiel estimé</dt><dd style={{ color: 'var(--accent-text)' }}>{gap.g.potential != null ? money(gap.g.potential, gap.p.currency) : '—'}</dd>
            </dl>
            <Callout tone="info">Estimation = nuits libres × ADR récent. Ce n’est pas un revenu garanti : le prix, la durée minimale et la demande locale peuvent changer le résultat.</Callout>
            <RefAdrPicker />
          </div>
        )}
      </Modal>
    </div>
  )
}
