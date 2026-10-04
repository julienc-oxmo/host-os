import { useMemo, useState } from 'react'
import { useApp } from '../data/AppContext'
import { Badge, Card, Empty, Field, Icon, Kpi, Modal, Select } from '../components/ui'
import { FilterBar, FxBanner, PageHead } from '../components/Layout'
import { fmtDate, money, pct } from '../lib/format'
import { aggregate } from '../lib/metrics'
import { EXPENSE_CATEGORIES, EXPENSE_LABELS, type Expense, type ExpenseCategory, type RecurrenceInterval } from '../lib/types'

const REC_LABELS: Record<RecurrenceInterval, string> = { monthly: 'Mensuelle', quarterly: 'Trimestrielle', yearly: 'Annuelle' }
const MONTHLY_FACTOR: Record<RecurrenceInterval, number> = { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }

export default function Expenses() {
  const { an, ds, props, display, period, today } = useApp()
  const [cat, setCat] = useState<'all' | ExpenseCategory>('all')
  const [edit, setEdit] = useState<Expense | 'new' | null>(null)
  const ids = new Set(props.map((p) => p.id))
  const pmap = new Map(ds.properties.map((p) => [p.id, p]))

  const { rows, byCat, total, excluded } = useMemo(() => {
    const rows: (Expense & { parent: string })[] = []
    for (const p of props) for (const e of an.props.get(p.id)!.expenses) if (e.date >= period.from && e.date <= period.to) rows.push({ ...e, parent: e.id.split('#')[0] })
    const byCat = new Map<ExpenseCategory, number>()
    const excluded = new Set<string>()
    let total = 0
    for (const e of rows) {
      const p = pmap.get(e.property_id)!
      const rate = an.fx.rate(p.currency, display)
      if (rate == null) { excluded.add(p.name); continue }
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount * rate)
      total += e.amount * rate
    }
    return { rows: rows.sort((a, b) => b.date.localeCompare(a.date)), byCat, total, excluded: [...excluded] }
  }, [an, props, period, display])

  const prevTotal = aggregate(an, props, display, period.prevFrom, period.prevTo).m.expenses
  const shown = rows.filter((r) => cat === 'all' || r.category === cat)
  const recurring = ds.expenses.filter((e) => e.recurring && ids.has(e.property_id))
  const monthlyRec = recurring.reduce((a, e) => {
    const rate = an.fx.rate(pmap.get(e.property_id)!.currency, display)
    return rate == null ? a : a + e.amount * MONTHLY_FACTOR[e.recurrence_interval ?? 'monthly'] * rate
  }, 0)
  const max = Math.max(1, ...byCat.values())

  return (
    <div className="page">
      <PageHead title="Dépenses" subtitle="Ce qui réduit réellement votre rentabilité." actions={<button className="btn primary" onClick={() => setEdit('new')}><Icon name="plus" size={15} />Ajouter une dépense</button>} />
      <FilterBar />
      <FxBanner excluded={props.filter((p) => excluded.includes(p.name))} />
      <div className="kpis">
        <Kpi label="Dépenses de la période" value={money(total, display)} delta={prevTotal ? ((total - prevTotal) / prevTotal) * 100 : null} invert hint={period.prevLabel} />
        <Kpi label="Charges récurrentes" value={`${money(monthlyRec, display)} / mois`} hint={`${recurring.length} dépense${recurring.length > 1 ? 's' : ''} récurrente${recurring.length > 1 ? 's' : ''}`} />
        <Kpi label="Écritures" value={String(rows.length)} hint="sur la période" />
      </div>

      <div className="grid cols-main" style={{ marginTop: 16 }}>
        <Card title="Liste" subtitle="Les dépenses récurrentes apparaissent à chaque échéance." flush
          actions={<Select<'all' | ExpenseCategory> value={cat} onChange={setCat} options={[{ key: 'all', label: 'Toutes catégories' }, ...EXPENSE_CATEGORIES.map((c) => ({ key: c, label: EXPENSE_LABELS[c] }))]} />}>
          {shown.length === 0 ? <Empty title="Aucune dépense" text="Aucune dépense sur cette période." /> : (
            <div className="table-wrap" style={{ maxHeight: 560, overflowY: 'auto', marginTop: 12 }}>
              <table className="table">
                <thead><tr><th>Date</th><th>Logement</th><th>Catégorie</th><th>Description</th><th className="num">Montant</th><th /></tr></thead>
                <tbody>
                  {shown.slice(0, 300).map((e) => (
                    <tr key={e.id}>
                      <td>{fmtDate(e.date, true)}</td><td>{pmap.get(e.property_id)?.name}</td>
                      <td><Badge plain>{EXPENSE_LABELS[e.category]}</Badge></td>
                      <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.recurring && <span title={`Récurrente · ${REC_LABELS[e.recurrence_interval ?? 'monthly']}`}>↻ </span>}{e.description}</td>
                      <td className="num">{money(e.amount, e.currency, { decimals: 2 })}</td>
                      <td><button className="btn ghost sm icon-btn" aria-label="Modifier" onClick={() => setEdit(ds.expenses.find((x) => x.id === e.parent) ?? null)}><Icon name="edit" size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="stack">
          <Card title="Par catégorie">
            <div className="stack-sm">
              {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => (
                <div key={c}><div className="row spread small"><span>{EXPENSE_LABELS[c]}</span><span className="muted">{money(v, display)} · {pct(total ? (v / total) * 100 : 0, 0)}</span></div>
                  <div className="bar-track" style={{ marginTop: 4 }}><div className="bar-fill" style={{ width: `${(v / max) * 100}%` }} /></div></div>
              ))}
              {byCat.size === 0 && <p className="muted">—</p>}
            </div>
          </Card>
          <Card title="Dépenses récurrentes" subtitle="Générées automatiquement à chaque échéance">
            <div className="stack-sm">
              {recurring.length === 0 && <p className="muted">Aucune.</p>}
              {recurring.map((e) => (
                <button key={e.id} className="row spread" style={{ background: 'none', border: 0, textAlign: 'left', padding: '6px 0', cursor: 'pointer' }} onClick={() => setEdit(e)}>
                  <span><b>{EXPENSE_LABELS[e.category]}</b><div className="small faint">{pmap.get(e.property_id)?.name} · {REC_LABELS[e.recurrence_interval ?? 'monthly']}</div></span>
                  <span className="small">{money(e.amount, e.currency, { decimals: 2 })}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
      {edit && <ExpenseModal key={edit === 'new' ? 'new' : edit.id} expense={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      <span style={{ display: 'none' }}>{today}</span>
    </div>
  )
}

function ExpenseModal({ expense, onClose }: { expense?: Expense; onClose: () => void }) {
  const { ds, repo, run, today } = useApp()
  const [f, setF] = useState({
    property_id: expense?.property_id ?? ds.properties[0]?.id ?? '', category: expense?.category ?? ('cleaning' as ExpenseCategory),
    amount: expense ? String(expense.amount) : '', date: expense?.date ?? today, description: expense?.description ?? '',
    recurring: expense?.recurring ?? false, interval: (expense?.recurrence_interval ?? 'monthly') as RecurrenceInterval, end: expense?.recurrence_end ?? '',
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const prop = ds.properties.find((p) => p.id === f.property_id)
  const amount = parseFloat(f.amount.replace(',', '.'))
  const valid = f.property_id && amount >= 0 && f.date
  const save = async () => {
    const payload = {
      property_id: f.property_id, category: f.category, amount, currency: prop?.currency ?? 'EUR', date: f.date, description: f.description || null,
      recurring: f.recurring, recurrence_interval: f.recurring ? f.interval : null, recurrence_end: f.recurring && f.end ? f.end : null,
    }
    await run(() => (expense ? repo.updateExpense(expense.id, payload) : repo.addExpense(payload)), expense ? 'Dépense mise à jour' : 'Dépense ajoutée')
    onClose()
  }
  return (
    <Modal open title={expense ? 'Modifier la dépense' : 'Nouvelle dépense'} onClose={onClose}
      footer={<>
        {expense && <button className="btn danger" onClick={async () => { if (confirm('Supprimer cette dépense ?')) { await run(() => repo.deleteExpense(expense.id), 'Dépense supprimée'); onClose() } }}>Supprimer</button>}
        <button className="btn primary" disabled={!valid} onClick={save}>Enregistrer</button></>}>
      <div className="form-grid">
        <Field label="Logement"><select className="select" style={{ width: '100%' }} value={f.property_id} onChange={(e) => set('property_id', e.target.value)}>{ds.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Catégorie"><select className="select" style={{ width: '100%' }} value={f.category} onChange={(e) => set('category', e.target.value as ExpenseCategory)}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{EXPENSE_LABELS[c]}</option>)}</select></Field>
        <Field label={`Montant (${prop?.currency ?? ''})`}><input className="input" inputMode="decimal" autoFocus value={f.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
        <Field label={f.recurring ? 'Première échéance' : 'Date'}><input type="date" className="input" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Description" className="full"><input className="input" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Ex. Plombier — robinet cuisine" /></Field>
        <label className="check full"><input type="checkbox" checked={f.recurring} onChange={(e) => set('recurring', e.target.checked)} />Dépense récurrente</label>
        {f.recurring && <>
          <Field label="Fréquence"><select className="select" style={{ width: '100%' }} value={f.interval} onChange={(e) => set('interval', e.target.value as RecurrenceInterval)}>{Object.entries(REC_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Fin (optionnelle)"><input type="date" className="input" value={f.end} onChange={(e) => set('end', e.target.value)} /></Field>
        </>}
      </div>
    </Modal>
  )
}
