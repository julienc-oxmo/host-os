import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../data/AppContext'
import { useAuth } from '../data/AuthContext'
import { Icon, Toasts, Select, Segmented, Callout } from './ui'
import { PERIOD_OPTIONS } from '../lib/periods'
import { CURRENCIES, type Currency, type Property } from '../lib/types'
import { fmtRange } from '../lib/format'
import { SEVERITY_LABELS } from '../lib/alerts'

export const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/portfolio', label: 'Portfolio', icon: 'portfolio' },
  { to: '/calendrier', label: 'Calendrier', icon: 'calendar' },
  { to: '/reservations', label: 'Réservations', icon: 'bookings' },
  { to: '/revenus', label: 'Revenus', icon: 'revenue' },
  { to: '/depenses', label: 'Dépenses', icon: 'expenses' },
  { to: '/analytics', label: 'Analytics', icon: 'analytics' },
  { to: '/insights', label: 'Insights', icon: 'insights' },
  { to: '/imports', label: 'Imports', icon: 'imports' },
  { to: '/parametres', label: 'Paramètres', icon: 'settings' },
]

export function Shell() {
  const { alerts, toasts, repo, run } = useApp()
  const { signOut } = useAuth()
  const loc = useLocation()
  const [more, setMore] = useState(false)
  useEffect(() => { setMore(false); window.scrollTo(0, 0) }, [loc.pathname])
  const unread = alerts.filter((a) => !a.read && a.severity !== 'info').length

  return (
    <div>
      {repo.mode === 'local' && (
        <div className="demo-banner">
          Mode démo local : les données sont stockées dans ce navigateur. Configurez Supabase (<code>.env</code>) pour la synchronisation multi-appareils.
        </div>
      )}
      <div className="app">
        <aside className="sidebar">
          <div className="brand"><span className="brand-mark"><Icon name="portfolio" size={15} /></span>Host OS</div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon name={n.icon} />{n.label}
              {n.to === '/insights' && unread > 0 && <span className="nav-badge">{unread}</span>}
            </NavLink>
          ))}
          <div className="sidebar-foot">
            <AlertsBell inline />
            {repo.mode === 'supabase' && <button className="btn ghost sm" onClick={() => run(signOut)}><Icon name="logout" size={14} />Se déconnecter</button>}
          </div>
        </aside>
        <main className="main">
          <div className="topbar-mobile">
            <div className="brand" style={{ padding: 0 }}><span className="brand-mark"><Icon name="portfolio" size={15} /></span>Host OS</div>
            <AlertsBell />
          </div>
          <Outlet />
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Navigation">
        {NAV.slice(0, 4).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}><Icon name={n.icon} />{n.label.slice(0, 11)}</NavLink>
        ))}
        <button onClick={() => setMore(true)} className={more ? 'active' : ''}><Icon name="more" />Plus</button>
      </nav>
      {more && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setMore(false)}>
          <div className="modal" style={{ padding: 12 }}>
            {NAV.slice(4).map((n) => <NavLink key={n.to} to={n.to} className="nav-link" style={{ padding: 14 }}><Icon name={n.icon} />{n.label}</NavLink>)}
            {repo.mode === 'supabase' && <button className="nav-link" style={{ padding: 14, width: '100%', border: 0, background: 'none' }} onClick={() => signOut()}><Icon name="logout" />Se déconnecter</button>}
          </div>
        </div>
      )}
      <Toasts items={toasts} />
    </div>
  )
}

export function AlertsBell({ inline }: { inline?: boolean }) {
  const { alerts, ds, repo, run } = useApp()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const unread = alerts.filter((a) => !a.read)
  const pname = (id: string | null) => ds.properties.find((p) => p.id === id)?.name
  const persisted = (ids: string[]) => ids.filter((id) => !alerts.find((a) => a.id === id)?.transient)
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button className={inline ? 'btn ghost sm' : 'btn ghost icon-btn'} onClick={() => setOpen((o) => !o)} aria-label="Alertes" style={{ position: 'relative', justifyContent: inline ? 'flex-start' : undefined, width: inline ? '100%' : undefined }}>
        <Icon name="bell" size={inline ? 14 : 18} />{inline && 'Alertes'}
        {unread.length > 0 && <span className={inline ? 'nav-badge' : 'dot-badge'}>{unread.length}</span>}
      </button>
      {open && (
        <div className="popover" style={inline ? { bottom: 40, top: 'auto', right: 'auto', left: 0 } : undefined}>
          <div className="row spread" style={{ marginBottom: 6 }}>
            <h3>Alertes</h3>
            {unread.length > 0 && <button className="btn ghost sm" onClick={() => run(() => repo.markAlerts(persisted(unread.map((a) => a.id)), true))}>Tout marquer comme lu</button>}
          </div>
          {alerts.length === 0 && <p className="muted" style={{ padding: '14px 0' }}>Tout est calme : aucune alerte pour le moment.</p>}
          {alerts.slice().sort((a, b) => Number(a.read) - Number(b.read)).map((a) => (
            <div key={a.id} className={`alert-item ${a.read ? 'read' : ''}`}>
              <span className={`sev ${a.severity}`} />
              <div className="grow">
                <div className="small faint">{SEVERITY_LABELS[a.severity]}{pname(a.property_id) ? ` · ${pname(a.property_id)}` : ''}</div>
                <div>{a.message}</div>
              </div>
              {!a.read && !a.transient && <button className="btn ghost sm icon-btn" title="Marquer comme lu" onClick={() => run(() => repo.markAlerts([a.id], true))}><Icon name="check" size={14} /></button>}
            </div>
          ))}
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => { setOpen(false); nav('/insights') }}>Voir les insights</button>
        </div>
      )}
    </div>
  )
}

/** Sélecteur de période + filtres (logement, ville, pays, devise). */
export function FilterBar({ showPeriod = true }: { showPeriod?: boolean }) {
  const { filters, setFilters, period, ds } = useApp()
  const cities = [...new Set(ds.properties.map((p) => p.city).filter(Boolean))] as string[]
  const countries = [...new Set(ds.properties.map((p) => p.country).filter(Boolean))] as string[]
  const currencies = [...new Set(ds.properties.map((p) => p.currency))]
  return (
    <div className="stack-sm" style={{ marginBottom: 22 }}>
      <div className="filters" style={{ marginBottom: 0 }}>
        {showPeriod && <Segmented value={filters.period} options={PERIOD_OPTIONS} onChange={(k) => setFilters({ period: k })} />}
        {showPeriod && filters.period === 'custom' && (
          <div className="row">
            <input type="date" className="input" style={{ width: 150 }} value={filters.custom.from} onChange={(e) => setFilters({ custom: { ...filters.custom, from: e.target.value } })} />
            <span className="faint">→</span>
            <input type="date" className="input" style={{ width: 150 }} value={filters.custom.to} onChange={(e) => setFilters({ custom: { ...filters.custom, to: e.target.value } })} />
          </div>
        )}
        <span className="sep" />
        <Select ariaLabel="Logement" value={filters.propertyId} onChange={(v) => setFilters({ propertyId: v })}
          options={[{ key: 'all', label: 'Tous les logements' }, ...ds.properties.map((p) => ({ key: p.id, label: p.name }))]} />
        {cities.length > 1 && <Select ariaLabel="Ville" value={filters.city} onChange={(v) => setFilters({ city: v })} options={[{ key: 'all', label: 'Toutes les villes' }, ...cities.map((c) => ({ key: c, label: c }))]} />}
        {countries.length > 1 && <Select ariaLabel="Pays" value={filters.country} onChange={(v) => setFilters({ country: v })} options={[{ key: 'all', label: 'Tous les pays' }, ...countries.map((c) => ({ key: c, label: c }))]} />}
        {currencies.length > 1 && <Select ariaLabel="Devise" value={filters.currency} onChange={(v) => setFilters({ currency: v as Currency | 'all' })} options={[{ key: 'all', label: 'Toutes devises' }, ...CURRENCIES.filter((c) => currencies.includes(c)).map((c) => ({ key: c, label: c }))]} />}
      </div>
      {showPeriod && <div className="faint small">{fmtRange(period.from, period.to)}{period.note ? ` · ${period.note}` : ''}</div>}
    </div>
  )
}

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return <div className="page-head"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{actions && <div className="row wrap">{actions}</div>}</div>
}

/** Bandeau affiché quand des logements ne peuvent pas être convertis (aucun taux renseigné) — jamais de taux inventé. */
export function FxBanner({ excluded }: { excluded: Property[] }) {
  const { display, repo, run, ds } = useApp()
  const [rate, setRate] = useState('')
  if (!excluded.length) return null
  const cur = [...new Set(excluded.map((p) => p.currency))]
  return (
    <div style={{ marginBottom: 18 }}>
      <Callout tone="info">
        <b>Taux de change manquant.</b> Les montants consolidés en {display} n’incluent pas : {excluded.map((p) => p.name).join(', ')}.
        {' '}Aucun taux n’est inventé — saisissez le vôtre{cur.length === 1 ? ':' : ' dans Paramètres.'}
        {cur.length === 1 && (
          <span className="row wrap" style={{ marginTop: 8 }}>
            <span>1 {cur[0]} =</span>
            <input className="input" style={{ width: 110 }} inputMode="decimal" placeholder="ex. 0,05" value={rate} onChange={(e) => setRate(e.target.value)} />
            <span>{display}</span>
            <button className="btn sm primary" disabled={!(parseFloat(rate.replace(',', '.')) > 0)}
              onClick={() => run(() => repo.setFxRate(cur[0], display, parseFloat(rate.replace(',', '.'))), 'Taux enregistré')}>Enregistrer</button>
            {ds.fxRates.length === 0 && <span className="small">Modifiable dans Paramètres.</span>}
          </span>
        )}
      </Callout>
    </div>
  )
}
