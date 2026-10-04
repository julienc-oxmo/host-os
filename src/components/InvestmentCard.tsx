import { useMemo, useState } from 'react'
import { useApp } from '../data/AppContext'
import { Callout, Card, Field, Kpi, Progress } from './ui'
import { TimeChart } from './charts/TimeChart'
import { addDays } from '../lib/dates'
import { fmtMonth, money, num, pct } from '../lib/format'
import { investmentSummary, monthlyProfit, paybackYears, projection, type Assumptions } from '../lib/investment'
import type { Property } from '../lib/types'

const KEYS: { k: keyof Assumptions; label: string; unit: string }[] = [
  { k: 'occupancy', label: 'Occupation visée', unit: '%' },
  { k: 'adr', label: 'ADR brut', unit: '' },
  { k: 'feePct', label: 'Frais plateforme', unit: '% du brut' },
  { k: 'taxPct', label: 'Impôt retenu à la source', unit: '% du brut' },
  { k: 'fixedCosts', label: 'Charges fixes mensuelles', unit: '/ mois' },
]

export function InvestmentCard({ property: p, onEdit }: { property: Property; onEdit: () => void }) {
  const { an, today } = useApp()
  const cur = p.currency
  const pp = an.props.get(p.id)!
  const sum = useMemo(() => investmentSummary(pp, p, today), [pp, p, today])
  const [over, setOver] = useState<Partial<Record<keyof Assumptions, string>>>({})
  if (!sum) return <Card title="Rentabilité de l’investissement"><p className="muted">Renseignez le prix d’achat pour calculer le rendement et l’amortissement.</p><button className="btn" style={{ marginTop: 12 }} onClick={onEdit}>Renseigner l’achat</button></Card>

  const base = sum.observed
  const a: Assumptions | null = base && {
    ...base, ...Object.fromEntries(Object.entries(over).filter(([, v]) => v !== '' && v != null && isFinite(Number(String(v).replace(',', '.')))).map(([k, v]) => [k, Number(String(v).replace(',', '.'))])),
  }
  const monthly = a ? monthlyProfit(a) : null
  const years = monthly != null ? paybackYears(sum.invested, Math.max(0, sum.cumulativeProfit), monthly) : null
  const payDate = years != null ? addDays(today, Math.round(years * 365)) : null
  const proj = monthly != null ? projection(sum.invested, Math.max(0, sum.cumulativeProfit), monthly, 15) : []
  const eur = an.fx.rate(cur, an.main)
  const short = sum.operatingDays < 365

  return (
    <Card title="Rentabilité de l’investissement" subtitle="Achat comptant : capital investi = prix + frais d’acquisition + ameublement." actions={<button className="btn sm" onClick={onEdit}>Modifier l’achat</button>}>
      <div className="stack">
        <div className="kpis">
          <Kpi label="Capital investi" value={money(sum.invested, cur)} hint={eur ? `≈ ${money(sum.invested * eur, an.main)}` : undefined} />
          <Kpi label="Déjà récupéré" value={money(sum.cumulativeProfit, cur)} hint={`${pct(sum.recoveredPct, 1)} du capital · profit net réalisé`} />
          <Kpi label="Rendement brut" info="Revenu brut annualisé / capital investi, au rythme observé." value={sum.grossYield != null ? pct(sum.grossYield, 1) : '—'} hint="annualisé, rythme observé" />
          <Kpi label="Rendement net" info="Profit net annualisé (après frais, impôt retenu et charges saisies) / capital investi." value={sum.netYield != null ? pct(sum.netYield, 1) : '—'} hint="annualisé, rythme observé" />
          <Kpi label="Amortissement estimé" value={years != null ? `${num(years, 1)} ans` : '—'} hint={payDate ? `vers ${fmtMonth(payDate)}` : 'profit mensuel ≤ 0'} />
          <Kpi label="Revenu net déjà sécurisé" value={money(sum.securedFuture, cur)} hint="réservations confirmées à venir" />
        </div>
        <div className="stack-sm">
          <div className="row spread small"><span>Capital récupéré</span><span className="muted">{pct(sum.recoveredPct, 1)}</span></div>
          <Progress value={Math.max(0, sum.cumulativeProfit)} target={sum.invested} />
        </div>
        <dl className="kv">
          <dt>Prix d’achat</dt><dd>{money(sum.price, cur)}</dd>
          <dt>Frais d’acquisition (notaire…)</dt><dd>{money(sum.costs, cur)}</dd>
          <dt>Ameublement</dt><dd>{sum.furnishing != null ? money(sum.furnishing, cur) : <span style={{ color: 'var(--warn)' }}>à compléter</span>}</dd>
        </dl>
        {sum.furnishing == null && <Callout>Le coût d’ameublement n’est pas renseigné : le capital investi, les rendements et l’amortissement sont calculés sans lui, donc trop optimistes.</Callout>}
        {short && <Callout tone="info">Estimation basée sur {Math.round(sum.operatingDays / 30.4)} mois d’exploitation seulement : la saisonnalité n’est pas encore connue. Les charges fixes (copropriété, internet, électricité, ménage, taxe foncière…) ne sont comptées que si vous les avez saisies dans Dépenses.</Callout>}

        {a && (
          <>
            <hr className="sep" />
            <div>
              <h3>Simulation</h3>
              <p className="small muted">Point de départ : votre rythme réel observé. Modifiez une hypothèse pour voir l’effet sur l’amortissement.</p>
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
              {KEYS.map(({ k, label, unit }) => (
                <Field key={k} label={`${label}${unit ? ` (${unit === '' ? cur : unit})` : ''}`}>
                  <input className="input" inputMode="decimal" value={over[k] ?? ''} placeholder={num(base![k], k === 'adr' || k === 'fixedCosts' ? 0 : 1)} onChange={(e) => setOver({ ...over, [k]: e.target.value })} />
                </Field>
              ))}
            </div>
            <div className="row spread wrap small muted">
              <span>Profit net mensuel simulé : <b style={{ color: 'var(--text)' }}>{money(monthly, cur)}</b></span>
              {Object.keys(over).length > 0 && <button className="btn ghost sm" onClick={() => setOver({})}>Revenir au rythme observé</button>}
            </div>
            <TimeChart labels={proj.map((x) => (x.year === 0 ? 'Auj.' : `An ${x.year}`))} height={240} fmt={(v) => money(v, cur)} axisFmt={(v) => money(v, cur, { compact: true })}
              reference={{ value: sum.invested, label: 'Capital investi' }} series={[{ name: 'Profit net cumulé', color: 'var(--c2)', values: proj.map((x) => x.cumulative) }]} />
            <p className="small faint">Projection linéaire (hors inflation, variation des prix, vacance exceptionnelle, travaux, impôt définitif et revente). Ce n’est pas une prévision certaine. L’amortissement comptable/fiscal du bien n’est pas calculé.</p>
          </>
        )}
      </div>
    </Card>
  )
}
