import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../data/AppContext'
import { Badge, Card, Empty, Segmented } from '../components/ui'
import { PageHead } from '../components/Layout'
import { generateInsights } from '../lib/insights'
import { SEVERITY_LABELS } from '../lib/alerts'
import type { Severity } from '../lib/types'

const TONE: Record<Severity, 'accent' | 'warn' | 'neg'> = { info: 'accent', watch: 'warn', important: 'neg' }

export default function Insights() {
  const { ds, an, refAdr, alerts, repo, run } = useApp()
  const [tab, setTab] = useState<'insights' | 'alerts'>('insights')
  const insights = useMemo(() => generateInsights(ds, an, refAdr), [ds, an, refAdr])
  const pname = (id: string | null) => ds.properties.find((p) => p.id === id)?.name ?? 'Portfolio'
  const order = ['important', 'watch', 'info']
  const sorted = alerts.slice().sort((a, b) => Number(a.read) - Number(b.read) || order.indexOf(a.severity) - order.indexOf(b.severity))
  const persisted = (ids: string[]) => ids.filter((id) => !alerts.find((a) => a.id === id)?.transient)

  return (
    <div className="page" style={{ maxWidth: 920 }}>
      <PageHead title="Insights" subtitle="Des observations calculées sur vos données réelles. Jamais de cause affirmée : l’observation, l’hypothèse éventuelle, puis une action possible."
        actions={<Segmented value={tab} onChange={setTab} options={[{ key: 'insights', label: `Insights (${insights.length})` }, { key: 'alerts', label: `Alertes (${alerts.filter((a) => !a.read).length})` }]} />} />

      {tab === 'insights' && (
        <div className="stack">
          {insights.length === 0 && <Card><Empty title="Pas encore d’insight" text="Il faut un peu d’historique (réservations sur plusieurs mois) pour que le système puisse comparer." /></Card>}
          {insights.map((i) => (
            <Card key={i.id}>
              <div className="insight">
                <div className="row spread wrap">
                  <div className="row wrap"><Badge tone={TONE[i.severity]}>{SEVERITY_LABELS[i.severity]}</Badge><span className="small muted" style={{ textTransform: 'capitalize' }}>{i.topic}{i.propertyId ? ` · ${pname(i.propertyId)}` : ''}</span></div>
                  {i.link && <Link className="btn sm ghost" to={i.link.to}>{i.link.label} →</Link>}
                </div>
                <div className="block"><div className="tag">Observation</div><div>{i.observation}</div></div>
                {i.hypothesis && <div className="block"><div className="tag">Hypothèse</div><div className="hyp">{i.hypothesis}</div></div>}
                {i.action && <div className="block"><div className="tag">Action possible</div><div>{i.action}</div></div>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'alerts' && (
        <Card title="Alertes de sous-performance" subtitle="Trois niveaux : Info, À surveiller, Important. Elles se résolvent d’elles-mêmes quand la situation s’améliore."
          actions={alerts.some((a) => !a.read && !a.transient) ? <button className="btn sm" onClick={() => run(() => repo.markAlerts(persisted(alerts.filter((a) => !a.read).map((a) => a.id)), true))}>Tout marquer comme lu</button> : undefined}>
          {sorted.length === 0 && <p className="muted">Aucune alerte : tout est dans la norme habituelle de vos logements.</p>}
          {sorted.map((a) => (
            <div key={a.id} className={`alert-item ${a.read ? 'read' : ''}`}>
              <span className={`sev ${a.severity}`} />
              <div className="grow"><div className="small faint">{SEVERITY_LABELS[a.severity]} · {pname(a.property_id)}</div>{a.message}</div>
              {!a.transient && <button className="btn sm ghost" onClick={() => run(() => repo.markAlerts([a.id], !a.read))}>{a.read ? 'Marquer non lu' : 'Marquer comme lu'}</button>}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
