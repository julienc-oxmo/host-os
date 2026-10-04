// Toutes les dates métier sont des chaînes « YYYY-MM-DD » (jour calendaire, sans fuseau).
// En interne on raisonne en « numéro de jour » (jours depuis 1970-01-01 UTC) pour éviter les pièges de fuseau/DST.
const MS = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')

export const toDay = (s: string): number => Math.floor(Date.parse(s.slice(0, 10) + 'T00:00:00Z') / MS)
export const fromDay = (n: number): string => new Date(n * MS).toISOString().slice(0, 10)

export function todayStr(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
export const addDays = (s: string, n: number) => fromDay(toDay(s) + n)
export const diffDays = (a: string, b: string) => toDay(b) - toDay(a)
export const startOfMonth = (s: string) => s.slice(0, 8) + '01'
export function endOfMonth(s: string): string {
  const [y, m] = s.split('-').map(Number)
  return fromDay(Date.UTC(y, m, 1) / MS - 1)
}
export function addMonths(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  const ny = Math.floor(t / 12)
  const nm = (t % 12) + 1
  const last = Number(endOfMonth(`${ny}-${pad(nm)}-01`).slice(8))
  return `${ny}-${pad(nm)}-${pad(Math.min(d, last))}`
}
export const addYears = (s: string, n: number) => addMonths(s, n * 12)
export const monthKey = (s: string) => s.slice(0, 7)
export const daysInMonth = (s: string) => Number(endOfMonth(s).slice(8))
/** 0 = lundi … 6 = dimanche */
export const weekday = (s: string) => (((toDay(s) + 3) % 7) + 7) % 7
export const inRange = (s: string, from: string, to: string) => s >= from && s <= to

/** Liste des premiers jours de mois entre deux dates (incluses). */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let cur = startOfMonth(from)
  while (cur <= to) {
    out.push(cur)
    cur = addMonths(cur, 1)
  }
  return out
}
