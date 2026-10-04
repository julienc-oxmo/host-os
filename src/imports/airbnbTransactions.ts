import type { ParsedCsv } from '../lib/csv'
import { todayStr } from '../lib/dates'
import type { Currency } from '../lib/types'
import { detectDateOrder, parseAmount, parseCurrency, parseDate, type DateOrder, type RowIssue } from './airbnbCsv'
import type { NormalizedReservation } from './types'

/**
 * Export Airbnb « Historique des transactions » : plusieurs lignes par réservation
 * (Réservation, Taxes reversées, Retenue TVA, Retenue d'impôt sur le revenu, Payout…).
 * On regroupe par code de confirmation :
 *   brut         = Σ « Revenus bruts » des lignes Réservation (frais de ménage inclus, comme Airbnb)
 *   frais        = Σ « Frais de service »
 *   net          = brut − frais (= Σ « Montant » des lignes Réservation)
 *   impôt retenu = Σ |Montant| des lignes « Retenue d'impôt sur le revenu » → dépense « taxes »
 * La TVA retenue est neutre : elle est compensée par la ligne « Taxes reversées » (ignorée).
 * Les lignes Payout / offres / bonus ne sont pas des réservations : ignorées.
 */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").trim()

const COLS: Record<string, string[]> = {
  txDate: ['date'], type: ['type'], code: ['code de confirmation', 'confirmation code'],
  booked: ['date de reservation', 'booking date'], start: ['date de debut', 'start date'], end: ['date de fin', 'end date'],
  nights: ['nuits', 'nights'], guest: ['voyageur', 'guest'], listing: ['logement', 'listing'], currency: ['devise', 'currency'],
  amount: ['montant', 'amount'], fee: ['frais de service', 'service fee'], gross: ['revenus bruts', 'gross earnings'],
}

function findCols(headers: string[]): Record<string, number> | null {
  const nh = headers.map(norm)
  const out: Record<string, number> = {}
  for (const [k, names] of Object.entries(COLS)) out[k] = nh.findIndex((h) => names.includes(h))
  return out.type >= 0 && out.code >= 0 && out.gross >= 0 && out.amount >= 0 && out.start >= 0 ? out : null
}

export const isTransactionExport = (csv: ParsedCsv) => findCols(csv.headers) !== null

export function parseAirbnbTransactions(csv: ParsedCsv, o: { dateOrder?: DateOrder; today?: string; defaultCurrency?: Currency } = {}) {
  const c = findCols(csv.headers)!
  const today = o.today ?? todayStr()
  const get = (r: string[], k: string) => (c[k] >= 0 ? (r[c[k]] ?? '').trim() : '')
  const order: 'dmy' | 'mdy' = !o.dateOrder || o.dateOrder === 'auto'
    ? detectDateOrder(csv.rows.flatMap((r) => [get(r, 'start'), get(r, 'txDate')]))
    : o.dateOrder
  const issues: RowIssue[] = []
  const groups = new Map<string, { row: number; rows: string[][]; }>()
  let ignored = 0
  csv.rows.forEach((r, i) => {
    const code = get(r, 'code')
    if (!code) { ignored++; return }
    const g = groups.get(code) ?? { row: i + 2, rows: [] }
    g.rows.push(r)
    groups.set(code, g)
  })

  const rows: (NormalizedReservation & { rowNumber: number; generatedId: boolean })[] = []
  for (const [code, g] of groups) {
    const res = g.rows.filter((r) => /^(reservation|reserva)/.test(norm(get(r, 'type'))) && !/ajust|adjust/.test(norm(get(r, 'type'))))
    if (res.length === 0) { issues.push({ row: g.row, level: 'warning', message: `${code} : aucune ligne « Réservation » (ajustement ou annulation ?) — ignoré.` }); continue }
    const first = res[0]
    const checkIn = parseDate(get(first, 'start'), order)
    const checkOut = parseDate(get(first, 'end'), order)
    if (!checkIn || !checkOut || checkOut <= checkIn) { issues.push({ row: g.row, level: 'error', message: `${code} : dates de séjour illisibles.` }); continue }
    let gross = 0, fee = 0, tax = 0
    for (const r of res) { gross += parseAmount(get(r, 'gross')) ?? 0; fee += parseAmount(get(r, 'fee')) ?? 0 }
    let taxDate: string | null = null
    for (const r of g.rows) if (/impot sur le revenu|income tax/.test(norm(get(r, 'type')))) {
      tax += Math.abs(parseAmount(get(r, 'amount')) ?? 0)
      taxDate ??= parseDate(get(r, 'txDate'), order)
    }
    if (gross <= 0) { issues.push({ row: g.row, level: 'error', message: `${code} : revenu brut nul.` }); continue }
    const other = g.rows.filter((r) => !res.includes(r) && !/taxes reversees|tva|vat|impot|income tax|payout/.test(norm(get(r, 'type'))))
    if (other.length) issues.push({ row: g.row, level: 'warning', message: `${code} : ${other.length} ligne(s) de type « ${get(other[0], 'type')} » non prises en compte.` })
    rows.push({
      rowNumber: g.row, generatedId: false, external_id: code, property_ref: get(first, 'listing') || null,
      guest_name: get(first, 'guest') || null, booking_date: parseDate(get(first, 'booked'), order),
      check_in: checkIn, check_out: checkOut,
      gross_revenue: round(gross), platform_fee: round(fee), net_revenue: round(gross - fee),
      currency: parseCurrency(get(first, 'currency')) ?? o.defaultCurrency ?? null, channel: 'airbnb',
      status: checkOut <= today ? 'completed' : 'confirmed',
      tax_withheld: tax > 0 ? round(tax) : undefined, tax_date: taxDate,
    })
  }
  return { rows, issues, groups: groups.size, ignoredLines: ignored, totalLines: csv.rows.length }
}
const round = (n: number) => Math.round(n * 100) / 100
