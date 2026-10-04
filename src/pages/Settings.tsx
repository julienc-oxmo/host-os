import { useState } from 'react'
import { useApp } from '../data/AppContext'
import { useAuth } from '../data/AuthContext'
import { Badge, Callout, Card, Field, Icon, Modal, Segmented } from '../components/ui'
import { PageHead } from '../components/Layout'
import { PropertyForm } from '../components/PropertyForm'
import { CURRENCIES, type Currency, type Property, type UserSettings } from '../lib/types'
import { fmtDate } from '../lib/format'

export default function Settings() {
  const { ds, repo, run } = useApp()
  const { user } = useAuth()
  const [editing, setEditing] = useState<Property | 'new' | null>(null)
  const [name, setName] = useState(ds.profile.display_name ?? '')
  const [base, setBase] = useState<Currency>('MXN')
  const [rate, setRate] = useState('')
  const settings = ds.profile.settings
  const save = (patch: Partial<UserSettings>) => run(() => repo.saveProfile({ settings: { ...settings, ...patch } }))
  const quote = ds.profile.main_currency

  return (
    <div className="page" style={{ maxWidth: 920 }}>
      <PageHead title="Paramètres" />
      <div className="stack">
        <Card title="Profil">
          <div className="form-grid">
            <Field label="Email"><input className="input" disabled value={user?.email ?? (repo.mode === 'local' ? 'Mode démo local' : '')} /></Field>
            <Field label="Prénom / nom affiché"><input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== (ds.profile.display_name ?? '') && run(() => repo.saveProfile({ display_name: name }))} /></Field>
            <Field label="Devise principale (consolidation)"><select className="select" style={{ width: '100%' }} value={ds.profile.main_currency} onChange={(e) => run(() => repo.saveProfile({ main_currency: e.target.value as Currency }), 'Devise principale mise à jour')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Apparence"><div><Segmented value={settings.theme ?? 'system'} onChange={(theme) => save({ theme })} options={[{ key: 'system', label: 'Auto' }, { key: 'light', label: 'Clair' }, { key: 'dark', label: 'Sombre' }]} /></div></Field>
          </div>
        </Card>

        <Card title="Logements" actions={<button className="btn sm primary" onClick={() => setEditing('new')}><Icon name="plus" size={14} />Ajouter</button>} flush>
          <div className="table-wrap" style={{ marginTop: 8 }}><table className="table">
            <thead><tr><th>Nom</th><th>Ville</th><th>Devise</th><th>Capacité</th><th>Statut</th><th /></tr></thead>
            <tbody>{ds.properties.map((p) => (
              <tr key={p.id}><td><b>{p.name}</b></td><td>{p.city}</td><td>{p.currency}</td><td>{p.capacity} · {p.bedrooms} ch.</td><td><Badge tone={p.active ? 'pos' : undefined}>{p.active ? 'Actif' : 'Inactif'}</Badge></td>
                <td><button className="btn sm ghost" onClick={() => setEditing(p)}>Modifier</button></td></tr>
            ))}</tbody></table></div>
        </Card>

        <Card title="Taux de change" subtitle={`Chaque logement garde sa devise native. Pour consolider en ${quote}, saisissez vos propres taux : Host OS n’en invente aucun. L’architecture est prête pour un fournisseur externe (table fx_rates, colonne source).`}>
          <div className="stack">
            {ds.fxRates.length === 0 && <Callout tone="info">Aucun taux renseigné. Les logements dans une autre devise que {quote} sont exclus des totaux consolidés (leurs chiffres restent visibles dans leur devise).</Callout>}
            {ds.fxRates.map((f) => (
              <div key={f.id} className="row spread"><span>1 {f.base} = <b>{f.rate}</b> {f.quote} <span className="faint small">· {f.source === 'manual' ? 'saisi manuellement' : f.source} le {fmtDate(f.as_of, true)}</span></span>
                <button className="btn ghost sm" onClick={() => run(() => repo.deleteFxRate(f.id), 'Taux supprimé')}>Supprimer</button></div>
            ))}
            <div className="row wrap">
              <span>1</span>
              <select className="select" value={base} onChange={(e) => setBase(e.target.value as Currency)}>{CURRENCIES.filter((c) => c !== quote).map((c) => <option key={c}>{c}</option>)}</select>
              <span>=</span><input className="input" style={{ width: 120 }} inputMode="decimal" placeholder="taux" value={rate} onChange={(e) => setRate(e.target.value)} /><span>{quote}</span>
              <button className="btn primary sm" disabled={!(parseFloat(rate.replace(',', '.')) > 0)} onClick={async () => { await run(() => repo.setFxRate(base, quote, parseFloat(rate.replace(',', '.'))), 'Taux enregistré'); setRate('') }}>Enregistrer</button>
            </div>
          </div>
        </Card>

        <Card title="Données" subtitle={repo.mode === 'local' ? 'Mode démo local : les données vivent dans ce navigateur.' : 'Connecté à Supabase.'}>
          <div className="row wrap">
            <button className="btn" onClick={() => confirm('Remplacer les données actuelles par les données de démonstration ?') && run(async () => { await repo.clearAll(); await repo.seedDemo() }, 'Données de démo rechargées')}>Charger les données de démo</button>
            <button className="btn danger" onClick={() => confirm('Supprimer TOUS les logements et données ?') && run(() => repo.clearAll(), 'Données supprimées')}>Tout effacer</button>
          </div>
        </Card>
      </div>
      <Modal open={editing != null} title={editing === 'new' ? 'Nouveau logement' : 'Modifier le logement'} onClose={() => setEditing(null)}>
        {editing != null && <PropertyForm property={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}
