import type { Currency } from './types'

const LOCALE = 'fr-FR'

export function money(v: number | null | undefined, cur: Currency, opts: { compact?: boolean; decimals?: number } = {}): string {
  if (v == null || !isFinite(v)) return '—'
  const digits = opts.decimals ?? 0
  const nf = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: cur,
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    ...(opts.compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
  })
  return nf.format(v).replace(/ /g, ' ')
}
export const num = (v: number | null | undefined, digits = 0) =>
  v == null || !isFinite(v) ? '—' : new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }).format(v)
export const pct = (v: number | null | undefined, digits = 0) =>
  v == null || !isFinite(v) ? '—' : `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }).format(v)} %`
export const pts = (v: number | null | undefined, digits = 0) =>
  v == null || !isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }).format(v)} pt${Math.abs(v) >= 2 ? 's' : ''}`

const dFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dFmtY = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const mFmt = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' })
const mShort = new Intl.DateTimeFormat(LOCALE, { month: 'short', timeZone: 'UTC' })
const mShortY = new Intl.DateTimeFormat(LOCALE, { month: 'short', year: '2-digit', timeZone: 'UTC' })
const parse = (s: string) => new Date(s.slice(0, 10) + 'T00:00:00Z')

export const fmtDate = (s: string | null | undefined, withYear = false) => (s ? (withYear ? dFmtY : dFmt).format(parse(s)) : '—')
export const fmtMonth = (s: string) => mFmt.format(parse(s.slice(0, 7) + '-01'))
export const fmtMonthShort = (s: string) => mShort.format(parse(s.slice(0, 7) + '-01')).replace('.', '')
export const fmtMonthShortY = (s: string) => mShortY.format(parse(s.slice(0, 7) + '-01')).replace('.', '')
export const fmtRange = (a: string, b: string) => `${fmtDate(a, a.slice(0, 4) !== b.slice(0, 4))} → ${fmtDate(b, true)}`

export const plural = (n: number, one: string, many = one + 's') => `${num(n)} ${Math.abs(n) >= 2 ? many : one}`
export const nightsLabel = (n: number) => plural(n, 'nuit')

export const CURRENCY_SYMBOL: Record<Currency, string> = { EUR: '€', MXN: 'MX$', USD: '$' }
export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
