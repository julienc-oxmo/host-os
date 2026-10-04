import { describe, expect, it } from 'vitest'
import { generateDemo } from './demo/generate'
import { aggregate, buildAnalytics, expandExpenses, findGaps, freeNights, opportunity, rangeMetrics, Fx } from './metrics'
import { addDays, endOfMonth, startOfMonth, toDay, weekday, addMonths } from './dates'
import { parseCsv } from './csv'
import { detectMapping, normalizeRows, parseAmount, parseDate } from '../imports/airbnbCsv'
import { planIngest } from '../imports/ingest'
import { parseIcs, classifyEvent } from './ical'
import { computeAlerts } from './alerts'
import { generateInsights } from './insights'
import { computePerformance } from './performance'
import { computeForecast } from './forecast'
import { resolvePeriod } from './periods'
import type { Dataset } from './types'

const TODAY = '2026-10-04'
const demo = generateDemo({ userId: 'u', today: TODAY })
const ds: Dataset = {
  profile: { id: 'u', email: null, display_name: 'T', main_currency: 'EUR', settings: {} },
  ...demo, calendars: [], alerts: [], imports: [], fxRates: [],
}
const an = buildAnalytics(ds, TODAY)

describe('dates', () => {
  it('weekday: 2026-10-04 est un dimanche', () => expect(weekday('2026-10-04')).toBe(6))
  it('fin de mois', () => { expect(endOfMonth('2026-02-10')).toBe('2026-02-28'); expect(addMonths('2026-01-31', 1)).toBe('2026-02-28') })
})

describe('données de démo', () => {
  it('2 logements EUR / MXN', () => expect(demo.properties.map((p) => p.currency)).toEqual(['EUR', 'MXN']))
  it('est déterministe', () => expect(generateDemo({ userId: 'u', today: TODAY }).reservations).toEqual(demo.reservations))
  it('nights = check_out − check_in, net = brut − frais', () => {
    for (const r of demo.reservations) {
      expect(r.nights).toBe(toDay(r.check_out) - toDay(r.check_in))
      expect(r.net_revenue).toBeCloseTo(r.gross_revenue - r.platform_fee, 2)
    }
  })
  it('aucun chevauchement entre réservations actives ni avec les blocages', () => {
    for (const p of demo.properties) {
      const act = demo.reservations.filter((r) => r.property_id === p.id && r.status !== 'cancelled').sort((a, b) => a.check_in.localeCompare(b.check_in))
      for (let i = 1; i < act.length; i++) expect(act[i].check_in >= act[i - 1].check_out).toBe(true)
      for (const ev of demo.calendarEvents.filter((e) => e.property_id === p.id))
        for (const r of act) expect(r.check_in < ev.end_date && r.check_out > ev.start_date).toBe(false)
    }
  })
  it('réservations futures existent et dates de réservation ≤ aujourd’hui', () => {
    expect(demo.reservations.filter((r) => r.check_in > TODAY).length).toBeGreaterThan(3)
    for (const r of demo.reservations) expect(r.booking_date! <= TODAY).toBe(true)
  })
  it('annulées à 0, passées « completed », futures « confirmed »', () => {
    for (const r of demo.reservations) {
      if (r.status === 'cancelled') expect(r.gross_revenue).toBe(0)
      else expect(r.status).toBe(r.check_out <= TODAY ? 'completed' : 'confirmed')
    }
  })
  it('saisonnalité : l’occupation varie selon les mois', () => {
    const pp = an.props.get(demo.properties[1].id)!
    const jan = rangeMetrics(pp, '2026-01-01', '2026-01-31').occupancy!
    const aug = rangeMetrics(pp, '2026-08-01', '2026-08-31').occupancy!
    expect(jan).toBeGreaterThan(aug)
  })
  it('occupation réaliste (50–95 %) et ADR proche de la base', () => {
    for (const p of demo.properties) {
      const m = rangeMetrics(an.props.get(p.id)!, addDays(TODAY, -364), TODAY)
      expect(m.occupancy!).toBeGreaterThan(50)
      expect(m.occupancy!).toBeLessThan(95)
    }
    const paris = rangeMetrics(an.props.get(demo.properties[0].id)!, addDays(TODAY, -364), TODAY)
    expect(paris.adr!).toBeGreaterThan(110); expect(paris.adr!).toBeLessThan(180)
  })
})

describe('calculs', () => {
  const pp = an.props.get(demo.properties[0].id)!
  const from = '2026-03-01'
  const to = '2026-03-31'
  const m = rangeMetrics(pp, from, to)
  it('occupation = nuits réservées / disponibles × 100', () => expect(m.occupancy).toBeCloseTo((m.reservedNights / m.availableNights) * 100, 6))
  it('les nuits bloquées réduisent les nuits disponibles', () => { expect(m.blockedNights).toBe(2); expect(m.availableNights).toBe(29) })
  it('ADR = brut / nuits vendues ; RevPAR = brut / disponibles', () => {
    expect(m.adr).toBeCloseTo(m.gross / m.soldNights, 6)
    expect(m.revpar).toBeCloseTo(m.gross / m.availableNights, 6)
  })
  it('profit = net − dépenses', () => expect(m.profit).toBeCloseTo(m.net - m.expenses, 6))
  it('somme des mois = année (revenu réparti prorata nuits)', () => {
    let sum = 0
    for (let k = 0; k < 12; k++) sum += rangeMetrics(pp, `2026-${String(k + 1).padStart(2, '0')}-01`, endOfMonth(`2026-${String(k + 1).padStart(2, '0')}-01`)).net
    expect(sum).toBeCloseTo(rangeMetrics(pp, '2026-01-01', '2026-12-31').net, 4)
  })
  it('séjour moyen = nuits / séjours', () => expect(m.avgStay).toBeCloseTo(m.stayNights / m.bookings, 6))
  it('lead time = check-in − date de réservation', () => {
    const rs = pp.active.filter((r) => r.check_in >= from && r.check_in <= to)
    const exp = rs.reduce((a, r) => a + (toDay(r.check_in) - toDay(r.booking_date!)), 0) / rs.length
    expect(m.avgLeadTime).toBeCloseTo(exp, 6)
  })
  it('opportunité = nuits libres non vendues × ADR de référence', () => {
    const o = opportunity(pp, from, to, 150)
    expect(o.unsoldNights).toBe(m.availableNights - m.reservedNights)
    expect(o.uncaptured).toBe(o.unsoldNights * 150)
    expect(o.potential).toBeCloseTo(m.gross + o.uncaptured, 6)
  })
  it('trous : encadrés par deux séjours, nuits libres vérifiées', () => {
    const gaps = findGaps(pp, from, to, 100)
    expect(gaps.length).toBeGreaterThan(0)
    for (const g of gaps) {
      expect(freeNights(pp, g.start, addDays(g.end, -1))).toBe(g.nights)
      expect(g.potential).toBe(g.nights * 100)
      expect(pp.nights.has(toDay(g.start) - 1)).toBe(true)
      expect(pp.nights.has(toDay(g.end))).toBe(true)
    }
  })
  it('dépenses récurrentes développées', () => {
    const ex = expandExpenses([{ id: 'x', property_id: 'p', category: 'internet', amount: 30, currency: 'EUR', date: '2026-01-15', description: null, recurring: true, recurrence_interval: 'monthly', recurrence_end: null }], '2026-04-30')
    expect(ex.map((e) => e.date)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15'])
  })
})

describe('multi-devises', () => {
  const props = ds.properties
  it('sans taux : le logement MXN est exclu (aucun taux inventé)', () => {
    const a = aggregate(an, props, 'EUR', '2026-09-01', '2026-09-30')
    expect(a.excluded.map((p) => p.currency)).toEqual(['MXN'])
    expect(a.included).toHaveLength(1)
  })
  it('avec un taux saisi : conversion et inverse', () => {
    const fx = new Fx([{ id: '1', user_id: 'u', base: 'MXN', quote: 'EUR', rate: 0.05, as_of: TODAY, source: 'manual' }])
    expect(fx.rate('MXN', 'EUR')).toBe(0.05)
    expect(fx.rate('EUR', 'MXN')).toBeCloseTo(20)
    expect(fx.rate('USD', 'EUR')).toBeNull()
    const an2 = buildAnalytics({ ...ds, fxRates: [{ id: '1', user_id: 'u', base: 'MXN', quote: 'EUR', rate: 0.05, as_of: TODAY, source: 'manual' }] }, TODAY)
    const a = aggregate(an2, props, 'EUR', '2026-09-01', '2026-09-30')
    expect(a.excluded).toHaveLength(0)
    const sep = (i: number) => rangeMetrics(an2.props.get(props[i].id)!, '2026-09-01', '2026-09-30')
    expect(a.m.net).toBeCloseTo(sep(0).net + sep(1).net * 0.05, 4)
  })
})

describe('périodes', () => {
  it('ce mois / mois précédent / année', () => {
    const p = resolvePeriod('this_month', TODAY)
    expect([p.from, p.to, p.prevFrom, p.prevTo]).toEqual(['2026-10-01', '2026-10-31', '2026-09-01', '2026-09-30'])
    const y = resolvePeriod('year', TODAY)
    expect([y.from, y.prevFrom, y.prevTo]).toEqual(['2026-01-01', '2025-01-01', '2025-10-04'])
    const m3 = resolvePeriod('3m', TODAY)
    expect(m3.to).toBe(TODAY); expect(toDay(m3.prevTo)).toBe(toDay(m3.from) - 1)
  })
})

describe('forecast, alertes, insights, performance', () => {
  it('forecast : confirmé ≤ total attendu et croissant avec l’horizon', () => {
    const f = computeForecast(an, [ds.properties[0]], 'EUR', 6)
    for (const p of f.points) { expect(p.expectedTotal).toBeGreaterThanOrEqual(p.confirmed); expect(p.estimated).toBeGreaterThanOrEqual(0) }
    expect(f.points[2].confirmed).toBeGreaterThanOrEqual(f.points[0].confirmed)
  })
  it('alertes : sévérités valides, clés uniques', () => {
    const al = computeAlerts(ds, an)
    expect(new Set(al.map((a) => a.dedupe_key)).size).toBe(al.length)
    for (const a of al) expect(['info', 'watch', 'important']).toContain(a.severity)
  })
  it('insights : observation chiffrée, jamais de « parce que »', () => {
    const ins = generateInsights(ds, an, '90d')
    expect(ins.length).toBeGreaterThan(0)
    for (const i of ins) { expect(i.observation.length).toBeGreaterThan(10); expect(/parce que|à cause de/i.test(i.observation + (i.hypothesis ?? ''))).toBe(false) }
  })
  it('performance : niveau défini avec 13 mois d’historique', () => {
    for (const p of ds.properties) expect(computePerformance(an.props.get(p.id)!, TODAY).level).not.toBe('unknown')
  })
  it('perf « unknown » sans historique', () => {
    const empty = buildAnalytics({ ...ds, reservations: [], calendarEvents: [], expenses: [] }, TODAY)
    expect(computePerformance(empty.props.get(ds.properties[0].id)!, TODAY).level).toBe('unknown')
  })
})

describe('import CSV', () => {
  const csvText = [
    'Code de confirmation;Statut;Nom du voyageur;Date de début;Date de fin;# de nuits;Réservé;Logement;Revenus bruts;Frais de service;Devise',
    'HMA1;Confirmée;Alice;12/10/2026;15/10/2026;3;01/10/2026;Appartement Paris;"1 234,50 €";"36,00";EUR',
    'HMA2;Annulée;Bob;20/10/2026;22/10/2026;2;02/10/2026;Appartement Paris;0;0;EUR',
    'HMA3;Confirmée;Carla;31/13/2026;02/11/2026;2;02/10/2026;Appartement Paris;300;10;EUR',
    'HMA1;Confirmée;Alice;12/10/2026;15/10/2026;3;01/10/2026;Appartement Paris;"1 234,50 €";"36,00";EUR',
  ].join('\n')
  const csv = parseCsv(csvText)
  it('parse, détecte séparateur et colonnes', () => {
    expect(csv.delimiter).toBe(';'); expect(csv.rows).toHaveLength(4)
    const m = detectMapping(csv.headers)
    expect(m.external_id).toBe(0); expect(m.check_in).toBe(3); expect(m.check_out).toBe(4); expect(m.gross_revenue).toBe(8); expect(m.platform_fee).toBe(9)
  })
  it('montants et dates multi-formats', () => {
    expect(parseAmount('1 234,50 €')).toBe(1234.5); expect(parseAmount('$1,234.56')).toBe(1234.56); expect(parseAmount('€1.234,56')).toBe(1234.56); expect(parseAmount('(12,00)')).toBe(-12)
    expect(parseDate('12/10/2026', 'dmy')).toBe('2026-10-12'); expect(parseDate('10/12/2026', 'mdy')).toBe('2026-10-12'); expect(parseDate('2026-10-12', 'dmy')).toBe('2026-10-12'); expect(parseDate('31/02/2026', 'dmy')).toBeNull()
    expect(parseDate('12 oct. 2026', 'dmy')).toBe('2026-10-12')
  })
  it('normalise : lignes invalides, doublons du fichier, statut', () => {
    const r = normalizeRows(csv, { mapping: detectMapping(csv.headers), dateOrder: 'auto', defaultCurrency: 'EUR', today: TODAY })
    expect(r.rows.map((x) => x.external_id)).toEqual(['HMA1', 'HMA2'])
    expect(r.rows[0]).toMatchObject({ gross_revenue: 1234.5, platform_fee: 36, net_revenue: 1198.5, status: 'confirmed', check_in: '2026-10-12' })
    expect(r.rows[1].status).toBe('cancelled')
    expect(r.issues.some((i) => i.level === 'error' && i.row === 4)).toBe(true)
    expect(r.issues.some((i) => /Doublon dans le fichier/.test(i.message))).toBe(true)
  })
  it('planIngest : nouvelles / déjà présentes', () => {
    const r = normalizeRows(csv, { mapping: detectMapping(csv.headers), dateOrder: 'auto', defaultCurrency: 'EUR', today: TODAY })
    const plan = planIngest(r.rows, [{ property_id: 'P', external_id: 'HMA1' }], () => 'P')
    expect(plan.analysed).toBe(2); expect(plan.fresh).toHaveLength(1); expect(plan.duplicates).toHaveLength(1)
    expect(planIngest(r.rows, [], () => null).unmapped).toHaveLength(2)
  })
})

describe('iCal', () => {
  const ics = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:abc@airbnb.com\r\nDTSTART;VALUE=DATE:20261012\r\nDTEND;VALUE=DATE:20261015\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:def\r\nDTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261022\r\nSUMMARY:Airbnb (Not available)\r\nEND:VEVENT\r\nEND:VCALENDAR`
  it('parse et classe', () => {
    const ev = parseIcs(ics)
    expect(ev).toEqual([{ uid: 'abc@airbnb.com', start: '2026-10-12', end: '2026-10-15', summary: 'Reserved' }, { uid: 'def', start: '2026-10-20', end: '2026-10-22', summary: 'Airbnb (Not available)' }])
    expect(ev.map(classifyEvent)).toEqual(['reserved', 'blocked'])
  })
  it('les événements iCal comptent dans l’occupation sans revenu', () => {
    const base = { ...ds, calendarEvents: [{ id: 'e', property_id: ds.properties[0].id, external_id: 'x', start_date: '2026-11-20', end_date: '2026-11-23', event_type: 'reserved' as const, source: 'ical' }] }
    const a2 = buildAnalytics({ ...base, reservations: base.reservations.filter((r) => !(r.check_out > '2026-11-19' && r.check_in < '2026-11-24')) }, TODAY)
    const m = rangeMetrics(a2.props.get(ds.properties[0].id)!, '2026-11-20', '2026-11-22')
    expect(m.reservedNights).toBeGreaterThanOrEqual(3); expect(m.soldNights).toBeLessThan(m.reservedNights)
  })
})
void startOfMonth
