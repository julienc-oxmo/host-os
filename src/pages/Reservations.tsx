import { useMemo, useState } from 'react'
import { useApp } from '../data/AppContext'
import { Badge, Card, Empty, Field, Icon, Modal, Select, useDebounced } from '../components/ui'
import { PageHead } from '../components/Layout'
import { fmtDate, money, num } from '../lib/format'
import { diffDays } from '../lib/dates'
import { toCsv } from '../lib/csv'
import { CHANNEL_LABELS, CURRENCIES, STATUS_LABELS, type Currency, type Reservation, type ReservationStatus } from '../lib/types'

type SortKey = 'check_in' | 'guest_name' | 'nights' | 'gross_revenue' | 'net_revenue' | 'booking_date' | 'check_out'
const TONE: Record<ReservationStatus, 'pos' | 'accent' | 'neg' | 'warn'> = { confirmed: 'accent', completed: 'pos', cancelled: 'neg', pending: 'warn' }

export default function Reservations() {
  const { ds } = useApp()
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 150).trim().toLowerCase()
  const [propertyId, setPropertyId] = useState('all')
  const [city, setCity] = useState('all')
  const [status, setStatus] = useState('all')
  const [channel, setChannel] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'check_in', dir: -1 })
  const [page, setPage] = useState(0)
  const [adding, setAdding] = useState(false)
  const PAGE = 50

  const pmap = useMemo(() => new Map(ds.properties.map((p) => [p.id, p])), [ds.properties])
  const cities = [...new Set(ds.properties.map((p) => p.city).filter(Boolean))] as string[]
  const channels = [...new Set(ds.reservations.map((r) => r.channel))]

  const rows = useMemo(() => {
    const out = ds.reservations.filter((r) => {
      const p = pmap.get(r.property_id)
      if (propertyId !== 'all' && r.property_id !== propertyId) return false
      if (city !== 'all' && p?.city !== city) return false
      if (status !== 'all' && r.status !== status) return false
      if (channel !== 'all' && r.channel !== channel) return false
      if (from && r.check_in < from) return false
      if (to && r.check_in > to) return false
      if (dq && !`${r.guest_name ?? ''} ${p?.name ?? ''} ${r.external_id ?? ''} ${r.channel}`.toLowerCase().includes(dq)) return false
      return true
    })
    const { k, dir } = sort
    return out.sort((a, b) => {
      const av = (a[k] ?? '') as string | number
      const bv = (b[k] ?? '') as string | number
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir
    })
  }, [ds.reservations, pmap, propertyId, city, status, channel, from, to, dq, sort])

  const active = rows.filter((r) => r.status === 'confirmed' || r.status === 'completed')
  const currencies = [...new Set(active.map((r) => r.currency))]
  const pageRows = rows.slice(page * PAGE, (page + 1) * PAGE)
  const th = (k: SortKey, label: string, cls = '') => (
    <th className={`sortable ${cls}`} onClick={() => { setSort((s) => ({ k, dir: s.k === k ? (-s.dir as 1 | -1) : -1 })); setPage(0) }}>
      {label}{sort.k === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  )
  const exportCsv = () => {
    const csv = toCsv([['Voyageur', 'Logement', 'Check-in', 'Check-out', 'Nuits', 'Brut', 'Frais', 'Net', 'Devise', 'Statut', 'Canal', 'Réservé le', 'ID externe'],
      ...rows.map((r) => [r.guest_name, pmap.get(r.property_id)?.name, r.check_in, r.check_out, r.nights, r.gross_revenue, r.platform_fee, r.net_revenue, r.currency, r.status, r.channel, r.booking_date, r.external_id])])
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'reservations.csv'
    a.click()
  }

  return (
    <div className="page">
      <PageHead title="Réservations" subtitle={`${num(rows.length)} réservation${rows.length > 1 ? 's' : ''}`}
        actions={<><button className="btn" onClick={exportCsv}>Exporter CSV</button><button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={15} />Ajouter</button></>} />
      <div className="filters">
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <input className="input" placeholder="Rechercher un voyageur, un logement, un ID…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} style={{ paddingLeft: 32 }} />
          <span style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-3)' }}><Icon name="search" size={15} /></span>
        </div>
        <Select ariaLabel="Logement" value={propertyId} onChange={(v) => { setPropertyId(v); setPage(0) }} options={[{ key: 'all', label: 'Tous les logements' }, ...ds.properties.map((p) => ({ key: p.id, label: p.name }))]} />
        {cities.length > 1 && <Select ariaLabel="Ville" value={city} onChange={(v) => { setCity(v); setPage(0) }} options={[{ key: 'all', label: 'Toutes les villes' }, ...cities.map((c) => ({ key: c, label: c }))]} />}
        <Select ariaLabel="Statut" value={status} onChange={(v) => { setStatus(v); setPage(0) }} options={[{ key: 'all', label: 'Tous statuts' }, ...Object.entries(STATUS_LABELS).map(([k, l]) => ({ key: k, label: l }))]} />
        <Select ariaLabel="Canal" value={channel} onChange={(v) => { setChannel(v); setPage(0) }} options={[{ key: 'all', label: 'Tous canaux' }, ...channels.map((c) => ({ key: c, label: CHANNEL_LABELS[c] ?? c }))]} />
        <div className="row"><input type="date" className="input" style={{ width: 142 }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Arrivée à partir du" /><span className="faint">→</span><input type="date" className="input" style={{ width: 142 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Arrivée jusqu’au" /></div>
        {(q || propertyId !== 'all' || city !== 'all' || status !== 'all' || channel !== 'all' || from || to) && <button className="btn ghost sm" onClick={() => { setQ(''); setPropertyId('all'); setCity('all'); setStatus('all'); setChannel('all'); setFrom(''); setTo('') }}>Réinitialiser</button>}
      </div>
      <Card flush>
        {rows.length === 0 ? <Empty title="Aucune réservation" text="Modifiez les filtres, ajoutez une réservation ou importez un CSV Airbnb." /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>{th('guest_name', 'Voyageur')}<th>Logement</th>{th('check_in', 'Check-in')}{th('check_out', 'Check-out')}{th('nights', 'Nuits', 'num')}{th('gross_revenue', 'Revenu brut', 'num')}<th className="num">Frais</th>{th('net_revenue', 'Revenu net', 'num')}<th>Devise</th><th>Statut</th><th>Canal</th>{th('booking_date', 'Réservée le')}<th /></tr></thead>
              <tbody>
                {pageRows.map((r) => <Row key={r.id} r={r} pname={pmap.get(r.property_id)?.name ?? '—'} />)}
              </tbody>
              {currencies.length === 1 && (
                <tfoot><tr><td colSpan={4}>Total (hors annulées) · {active.length}</td><td className="num">{num(active.reduce((a, r) => a + r.nights, 0))}</td>
                  <td className="num">{money(active.reduce((a, r) => a + r.gross_revenue, 0), currencies[0])}</td><td className="num">{money(active.reduce((a, r) => a + r.platform_fee, 0), currencies[0])}</td>
                  <td className="num">{money(active.reduce((a, r) => a + r.net_revenue, 0), currencies[0])}</td><td colSpan={5} /></tr></tfoot>
              )}
            </table>
          </div>
        )}
        {rows.length > PAGE && (
          <div className="row spread" style={{ padding: 14 }}>
            <span className="small muted">{page * PAGE + 1}–{Math.min(rows.length, (page + 1) * PAGE)} sur {rows.length}</span>
            <div className="row"><button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</button><button className="btn sm" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Suivant</button></div>
          </div>
        )}
      </Card>
      {currencies.length > 1 && <p className="small faint" style={{ marginTop: 10 }}>Plusieurs devises : les totaux par devise sont disponibles dans la page Revenus.</p>}
      <ReservationModal open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

function Row({ r, pname }: { r: Reservation; pname: string }) {
  const { repo, run } = useApp()
  const cancelled = r.status === 'cancelled'
  return (
    <tr style={{ opacity: cancelled ? 0.55 : 1 }}>
      <td><b>{r.guest_name ?? '—'}</b></td><td>{pname}</td><td>{fmtDate(r.check_in, true)}</td><td>{fmtDate(r.check_out, true)}</td>
      <td className="num">{r.nights}</td><td className="num">{money(r.gross_revenue, r.currency, { decimals: 2 })}</td><td className="num">{money(r.platform_fee, r.currency, { decimals: 2 })}</td><td className="num">{money(r.net_revenue, r.currency, { decimals: 2 })}</td>
      <td>{r.currency}</td><td><Badge tone={TONE[r.status]}>{STATUS_LABELS[r.status]}</Badge></td><td>{CHANNEL_LABELS[r.channel] ?? r.channel}</td><td>{fmtDate(r.booking_date, true)}</td>
      <td><button className="btn ghost sm icon-btn" aria-label="Supprimer" onClick={() => confirm('Supprimer cette réservation ?') && run(() => repo.deleteReservation(r.id), 'Réservation supprimée')}><Icon name="trash" size={14} /></button></td>
    </tr>
  )
}

function ReservationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ds, repo, run, today } = useApp()
  const [f, setF] = useState({ property_id: ds.properties[0]?.id ?? '', guest_name: '', check_in: today, check_out: '', booking_date: today, gross: '', fee: '', channel: 'direct', status: 'confirmed' as ReservationStatus })
  const prop = ds.properties.find((p) => p.id === f.property_id)
  const gross = parseFloat(f.gross.replace(',', '.')) || 0
  const fee = parseFloat(f.fee.replace(',', '.')) || 0
  const valid = f.property_id && f.check_in && f.check_out && f.check_out > f.check_in && gross >= 0
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  return (
    <Modal open={open} title="Ajouter une réservation" onClose={onClose}
      footer={<button className="btn primary" disabled={!valid} onClick={async () => {
        await run(() => repo.addReservation({ property_id: f.property_id, external_id: null, guest_name: f.guest_name || null, booking_date: f.booking_date || null, check_in: f.check_in, check_out: f.check_out,
          gross_revenue: gross, platform_fee: fee, net_revenue: Math.round((gross - fee) * 100) / 100, currency: (prop?.currency ?? 'EUR') as Currency, channel: f.channel, status: f.status, source: 'manual' }), 'Réservation ajoutée')
        onClose()
      }}>Ajouter</button>}>
      <div className="form-grid">
        <Field label="Logement" className="full"><select className="select" style={{ width: '100%' }} value={f.property_id} onChange={(e) => set('property_id', e.target.value)}>{ds.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Voyageur" className="full"><input className="input" value={f.guest_name} onChange={(e) => set('guest_name', e.target.value)} /></Field>
        <Field label="Check-in"><input type="date" className="input" value={f.check_in} onChange={(e) => set('check_in', e.target.value)} /></Field>
        <Field label="Check-out"><input type="date" className="input" value={f.check_out} onChange={(e) => set('check_out', e.target.value)} /></Field>
        <Field label={`Revenu brut (${prop?.currency ?? ''})`}><input className="input" inputMode="decimal" value={f.gross} onChange={(e) => set('gross', e.target.value)} /></Field>
        <Field label="Frais plateforme"><input className="input" inputMode="decimal" value={f.fee} onChange={(e) => set('fee', e.target.value)} placeholder="0" /></Field>
        <Field label="Canal"><select className="select" style={{ width: '100%' }} value={f.channel} onChange={(e) => set('channel', e.target.value)}>{Object.entries(CHANNEL_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Statut"><select className="select" style={{ width: '100%' }} value={f.status} onChange={(e) => set('status', e.target.value as ReservationStatus)}>{Object.entries(STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Date de réservation"><input type="date" className="input" value={f.booking_date} onChange={(e) => set('booking_date', e.target.value)} /></Field>
        <div className="small muted" style={{ alignSelf: 'end' }}>{f.check_out > f.check_in ? `${diffDays(f.check_in, f.check_out)} nuits · net ${money(gross - fee, prop?.currency ?? 'EUR', { decimals: 2 })}` : ''}</div>
      </div>
    </Modal>
  )
}
void CURRENCIES
