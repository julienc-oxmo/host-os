import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { createSupabaseRepo } from './supabaseRepo'
import { createLocalRepo } from './localRepo'
import type { Repo } from './repository'
import type { AlertRow, Currency, Dataset, Property, RefAdr } from '../lib/types'
import { buildAnalytics, type Analytics } from '../lib/metrics'
import { todayStr } from '../lib/dates'
import { resolvePeriod, type CustomRange, type Period, type PeriodKey } from '../lib/periods'
import { computeAlerts } from '../lib/alerts'

export interface Filters {
  period: PeriodKey
  custom: CustomRange
  propertyId: string
  city: string
  country: string
  currency: Currency | 'all'
}

export interface Toast { id: number; text: string; kind: 'ok' | 'error' }

interface AppCtx {
  repo: Repo
  ds: Dataset
  an: Analytics
  today: string
  loading: boolean
  error: string | null
  reload(): Promise<void>
  /** Exécute une écriture, recharge les données, affiche une confirmation ou l'erreur. */
  run<T>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined>
  filters: Filters
  setFilters(p: Partial<Filters>): void
  period: Period
  props: Property[]
  display: Currency
  refAdr: RefAdr
  setRefAdr(v: RefAdr): void
  alerts: (AlertRow & { transient?: boolean })[]
  toasts: Toast[]
  toast(text: string, kind?: Toast['kind']): void
}

const Ctx = createContext<AppCtx>(null as never)
export const useApp = () => useContext(Ctx)

const FILTER_KEY = 'hostos.filters.v1'
const defaultFilters = (today: string): Filters => ({
  period: 'this_month', custom: { from: today.slice(0, 8) + '01', to: today }, propertyId: 'all', city: 'all', country: 'all', currency: 'all',
})

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const today = useMemo(() => todayStr(), [])
  const repo = useMemo<Repo>(
    () => (supabase ? createSupabaseRepo(supabase, user!.id, user!.email) : createLocalRepo()),
    [user?.id],
  )
  const [ds, setDs] = useState<Dataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [filters, setFiltersState] = useState<Filters>(() => {
    try { return { ...defaultFilters(today), ...JSON.parse(localStorage.getItem(FILTER_KEY) ?? '{}') } } catch { return defaultFilters(today) }
  })

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200)
  }, [])

  const reload = useCallback(async () => {
    try { setDs(await repo.load()); setError(null) } catch (e) { setError((e as Error).message) }
  }, [repo])

  useEffect(() => { setDs(null); reload() }, [reload])

  const run = useCallback(async <T,>(fn: () => Promise<T>, okMsg?: string) => {
    try {
      const r = await fn()
      await reload()
      if (okMsg) toast(okMsg)
      return r
    } catch (e) {
      toast((e as Error).message, 'error')
      return undefined
    }
  }, [reload, toast])

  const setFilters = useCallback((p: Partial<Filters>) => {
    setFiltersState((f) => {
      const n = { ...f, ...p }
      try { localStorage.setItem(FILTER_KEY, JSON.stringify(n)) } catch { /* ignore */ }
      return n
    })
  }, [])

  const an = useMemo(() => (ds ? buildAnalytics(ds, today) : null), [ds, today])

  // Alertes : calculées à partir des données, persistées (dédoublonnées) pour conserver l'état « lu ».
  const computed = useMemo(() => (ds && an ? computeAlerts(ds, an) : []), [ds, an])
  const syncing = useRef(new Set<string>())
  useEffect(() => {
    if (!ds) return
    const have = new Set(ds.alerts.map((a) => a.dedupe_key))
    const missing = computed.filter((a) => !have.has(a.dedupe_key) && !syncing.current.has(a.dedupe_key))
    if (!missing.length) return
    missing.forEach((m) => syncing.current.add(m.dedupe_key))
    repo.insertAlerts(missing).then((rows) => rows.length && setDs((d) => (d ? { ...d, alerts: [...d.alerts, ...rows] } : d))).catch(() => {})
  }, [computed, ds, repo])

  const alerts = useMemo(() => {
    if (!ds) return []
    return computed.map((c) => {
      const row = ds.alerts.find((a) => a.dedupe_key === c.dedupe_key)
      return row ?? { ...c, id: c.dedupe_key, user_id: null, created_at: new Date().toISOString(), read: false, transient: true }
    })
  }, [computed, ds])

  const setRefAdr = useCallback((v: RefAdr) => {
    if (!ds) return
    setDs({ ...ds, profile: { ...ds.profile, settings: { ...ds.profile.settings, reference_adr: v } } })
    repo.saveProfile({ settings: { ...ds.profile.settings, reference_adr: v } }).catch((e) => toast(e.message, 'error'))
  }, [ds, repo, toast])

  const period = useMemo(() => resolvePeriod(filters.period, today, filters.custom), [filters.period, filters.custom, today])

  const props = useMemo(() => {
    if (!ds) return []
    return ds.properties.filter((p) => {
      if (filters.propertyId !== 'all') return p.id === filters.propertyId
      if (!p.active) return false
      if (filters.city !== 'all' && p.city !== filters.city) return false
      if (filters.country !== 'all' && p.country !== filters.country) return false
      if (filters.currency !== 'all' && p.currency !== filters.currency) return false
      return true
    })
  }, [ds, filters])

  if (!ds || !an) {
    return (
      <div className="splash">
        {error ? (
          <div className="card" style={{ maxWidth: 480 }}>
            <h3>Impossible de charger les données</h3>
            <p className="muted">{error}</p>
            <p className="muted small">Vérifiez que la migration <code>supabase/migrations/0001_schema.sql</code> a bien été appliquée.</p>
            <button className="btn" onClick={reload}>Réessayer</button>
          </div>
        ) : <div className="spinner" aria-label="Chargement" />}
      </div>
    )
  }

  const display: Currency =
    filters.currency !== 'all' ? filters.currency
      : filters.propertyId !== 'all' ? (ds.properties.find((p) => p.id === filters.propertyId)?.currency ?? ds.profile.main_currency)
        : ds.profile.main_currency

  const value: AppCtx = {
    repo, ds, an, today, loading: false, error, reload, run, filters, setFilters, period, props, display,
    refAdr: ds.profile.settings.reference_adr ?? '90d', setRefAdr, alerts, toasts, toast,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
