import { useEffect, useState, type ReactNode } from 'react'
import { pct, pts } from '../lib/format'
import { PERF_LABELS, type PerfLevel } from '../lib/performance'
import { initials } from '../lib/format'

/* ───────── Icônes (tracés type « lucide », stroke currentColor) ───────── */
const ICONS: Record<string, string> = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  portfolio: 'M3 21V8l9-5 9 5v13M9 21v-6h6v6',
  calendar: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  bookings: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  revenue: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  expenses: 'M2 7h20v12H2zM2 11h20M6 15h4',
  analytics: 'M3 3v18h18M7 14l4-4 4 4 5-6',
  insights: 'M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3zM9 20h6M10 23h4',
  imports: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6L6 18M6 6l12 12',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  chevL: 'M15 18l-6-6 6-6',
  chevR: 'M9 18l6-6-6-6',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  upload: 'M12 21V9m0 0l-4 4m4-4l4 4M4 7V4h16v3',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  check: 'M20 6L9 17l-5-5',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
}
export function Icon({ name, size = 17 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name] ?? ''} />
    </svg>
  )
}

/* ───────── Briques ───────── */
export function Card({ title, subtitle, actions, children, className = '', flush }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; flush?: boolean
}) {
  return (
    <section className={`card ${flush ? 'flush' : ''} ${className}`}>
      {(title || actions) && (
        <div className="card-head" style={flush ? { padding: '20px 20px 0' } : undefined}>
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="row wrap">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Delta({ value, kind = 'pct', invert, suffix }: { value: number | null; kind?: 'pct' | 'pts'; invert?: boolean; suffix?: string }) {
  if (value == null || !isFinite(value)) return <span className="delta flat">—</span>
  const good = invert ? value < 0 : value > 0
  const flat = Math.abs(value) < (kind === 'pct' ? 0.5 : 0.5)
  const cls = flat ? 'flat' : good ? 'pos' : 'neg'
  const txt = kind === 'pct' ? `${value > 0 ? '+' : ''}${pct(value, Math.abs(value) < 10 ? 1 : 0)}` : pts(value, 1)
  return (
    <span className={`delta ${cls}`}>
      {!flat && <Icon name={value > 0 ? 'arrowUp' : 'arrowDown'} size={11} />}
      {txt}{suffix}
    </span>
  )
}

export function Kpi({ label, value, delta, deltaKind, invert, hint, big, className = '', info }: {
  label: string; value: ReactNode; delta?: number | null; deltaKind?: 'pct' | 'pts'; invert?: boolean; hint?: ReactNode; big?: boolean; className?: string; info?: string
}) {
  return (
    <div className={`card kpi ${big ? 'big' : ''} ${className}`}>
      <div className="label">{label}{info && <span title={info} style={{ cursor: 'help', opacity: 0.6 }}><Icon name="info" size={13} /></span>}</div>
      <div className="value" style={typeof value === 'string' && value.length > 11 ? { fontSize: value.length > 14 ? 17 : 21 } : undefined}>{value}</div>
      <div className="row wrap" style={{ gap: 8 }}>
        {delta !== undefined && <Delta value={delta} kind={deltaKind} invert={invert} />}
        {hint && <span className="hint">{hint}</span>}
      </div>
    </div>
  )
}

export function Badge({ tone, children, plain }: { tone?: 'pos' | 'neg' | 'warn' | 'accent'; children: ReactNode; plain?: boolean }) {
  return <span className={`badge ${tone ?? ''} ${plain ? 'plain' : ''}`}>{children}</span>
}

const PERF_TONE: Record<PerfLevel, 'pos' | 'accent' | 'warn' | 'neg' | undefined> = {
  excellent: 'pos', good: 'accent', watch: 'warn', under: 'neg', unknown: undefined,
}
export function PerfBadge({ level }: { level: PerfLevel }) {
  return <Badge tone={PERF_TONE[level]}>{PERF_LABELS[level]}</Badge>
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.key} className={o.key === value ? 'on' : ''} onClick={() => onChange(o.key)} role="tab" aria-selected={o.key === value}>{o.label}</button>
      ))}
    </div>
  )
}

export function Select<T extends string>({ value, onChange, options, ariaLabel }: { value: T; onChange: (v: T) => void; options: { key: T; label: string }[]; ariaLabel?: string }) {
  return (
    <select className="select" value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  )
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <div className={`field ${className}`}><label>{label}</label>{children}</div>
}

export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal aria-label={title}>
        <div className="modal-head"><h3>{title}</h3><button className="btn ghost icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button></div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Empty({ title, text, action }: { title: string; text?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{text && <p>{text}</p>}{action && <div style={{ marginTop: 16 }}>{action}</div>}</div>
}

export function PropertyImage({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="pimg">
      {src && !failed ? <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} /> : <div className="fallback">{initials(name)}</div>}
    </div>
  )
}

export function Progress({ value, target, tone }: { value: number; target: number; tone?: 'pos' | 'warn' }) {
  const p = target > 0 ? Math.min(100, (value / target) * 100) : 0
  return <div className="bar-track" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}><div className={`bar-fill ${tone ?? ''}`} style={{ width: `${p}%` }} /></div>
}

export function Callout({ tone = 'warn', children, action }: { tone?: 'warn' | 'info' | 'pos' | 'neg'; children: ReactNode; action?: ReactNode }) {
  return <div className={`callout ${tone === 'warn' ? '' : tone}`}><Icon name="info" size={16} /><div>{children}</div>{action}</div>
}

export function Toasts({ items }: { items: { id: number; text: string; kind: 'ok' | 'error' }[] }) {
  return <div className="toasts" role="status">{items.map((t) => <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>{t.text}</div>)}</div>
}

export function useDebounced<T>(v: T, ms = 200): T {
  const [x, setX] = useState(v)
  useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t) }, [v, ms])
  return x
}
