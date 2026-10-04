import { addDays, addMonths, diffDays, fromDay, startOfMonth, toDay, weekday } from '../dates'
import type {
  CalendarEvent, Currency, Expense, ExpenseCategory, Property, PropertyTarget, RecurrenceInterval, Reservation,
} from '../types'

/**
 * Données de démonstration : 2 logements, ~13 mois d'historique + réservations futures.
 * Générateur déterministe (graine fixe) → mêmes chiffres à chaque exécution.
 * Cohérence garantie par construction :
 *   nights = check_out − check_in ; net = brut − frais ; aucune réservation active ne se chevauche ;
 *   les réservations annulées ont des montants à 0 ; booking_date ≤ aujourd'hui.
 */

export interface DemoBundle {
  properties: Property[]
  reservations: Reservation[]
  expenses: Expense[]
  calendarEvents: CalendarEvent[]
  targets: PropertyTarget[]
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Cfg {
  key: string
  name: string
  city: string
  country: string
  currency: Currency
  address: string
  bedrooms: number
  capacity: number
  image: string
  baseAdr: number
  round: number
  occ: number[] // taux d'occupation cible par mois (jan→déc)
  price: number[] // facteur de prix saisonnier
  meanStay: number
  meanLead: number
  cleaning: number
  channels: [string, number][]
  blocks: { from: string; to: string; label: string }[] // à partir du début de la période de démo
  target: { revenue: number; occupancy: number; adr: number }
}

const FEE: Record<string, number> = { airbnb: 0.155, booking: 0.15, vrbo: 0.08, direct: 0 }
const STAY_LENGTHS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 14]
const GUESTS = [
  'Camille Laurent', 'Lucas Martin', 'Emma Rossi', 'Noah Schmidt', 'Sofia García', 'Liam O’Brien', 'Chloé Dubois', 'Mateo Fernández',
  'Hannah Becker', 'Oliver Smith', 'Lina Haddad', 'Arthur Bernard', 'Valentina Ruiz', 'Jack Miller', 'Inès Moreau', 'Diego Herrera',
  'Anna Kowalski', 'Thomas Lefèvre', 'Mia Johansson', 'Leo Silva', 'Sarah Cohen', 'Gabriel Costa', 'Julie Petit', 'Daniel Torres',
  'Elena Popescu', 'Paul Garnier', 'Isabella Conti', 'Ethan Brown', 'Marie Girard', 'Santiago López', 'Zoé Fontaine', 'Kenji Tanaka',
  'Laura Müller', 'Pedro Almeida', 'Alice Roux', 'Samuel Wright', 'Nina Petrova', 'Hugo Mercier', 'Carla Mendoza', 'Adam Nowak',
]

const CONFIGS = (today: string, start: string): Cfg[] => {
  const y = Number(today.slice(0, 4))
  return [
    {
      key: 'paris', name: 'Appartement Paris', city: 'Paris', country: 'France', currency: 'EUR',
      address: '12 rue de Turenne, 75003 Paris', bedrooms: 1, capacity: 3,
      image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=70',
      baseAdr: 138, round: 1,
      occ: [0.58, 0.62, 0.72, 0.84, 0.86, 0.84, 0.78, 0.66, 0.85, 0.83, 0.68, 0.8],
      price: [0.88, 0.9, 0.98, 1.08, 1.12, 1.12, 1.05, 0.95, 1.1, 1.08, 0.92, 1.15],
      meanStay: 3.6, meanLead: 21, cleaning: 55,
      channels: [['airbnb', 0.74], ['booking', 0.16], ['direct', 0.06], ['vrbo', 0.04]],
      blocks: [
        { from: `${y}-08-10`, to: `${y}-08-17`, label: 'Séjour propriétaire' },
        { from: `${y}-03-05`, to: `${y}-03-07`, label: 'Intervention plomberie' },
      ],
      target: { revenue: 2900, occupancy: 80, adr: 150 },
    },
    {
      key: 'mexico', name: 'Appartement Mexico City', city: 'Mexico City', country: 'Mexique', currency: 'MXN',
      address: 'Calle Durango 195, Roma Norte, 06700 CDMX', bedrooms: 2, capacity: 4,
      image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=70',
      baseAdr: 1650, round: 10,
      occ: [0.84, 0.86, 0.84, 0.78, 0.7, 0.58, 0.6, 0.56, 0.62, 0.76, 0.88, 0.8],
      price: [1.08, 1.1, 1.08, 1.0, 0.95, 0.88, 0.9, 0.88, 0.92, 1.1, 1.18, 1.15],
      meanStay: 4.4, meanLead: 28, cleaning: 450,
      channels: [['airbnb', 0.86], ['booking', 0.06], ['direct', 0.05], ['vrbo', 0.03]],
      blocks: [{ from: `${y}-06-22`, to: `${y}-06-28`, label: 'Séjour propriétaire' }],
      target: { revenue: 32000, occupancy: 75, adr: 1750 },
    },
  ].map((c) => ({ ...c, blocks: c.blocks.filter((b) => b.from >= start && b.to <= addDays(today, 365)) })) as Cfg[]
}

export interface DemoOptions {
  userId: string
  today: string
  seed?: number
}

export function generateDemo({ userId, today, seed = 20260101 }: DemoOptions): DemoBundle {
  const rng = mulberry32(seed)
  const uuid = () => {
    const h = () => Math.floor(rng() * 0x10000).toString(16).padStart(4, '0')
    return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`
  }
  const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)]
  const weighted = <T,>(items: [T, number][]) => {
    let r = rng() * items.reduce((a, [, w]) => a + w, 0)
    for (const [v, w] of items) if ((r -= w) <= 0) return v
    return items[items.length - 1][0]
  }
  const code = () => 'HM' + Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(rng() * 32)]).join('')

  const start = startOfMonth(addMonths(today, -12))
  const horizon = addDays(today, 130)
  const bundle: DemoBundle = { properties: [], reservations: [], expenses: [], calendarEvents: [], targets: [] }

  for (const c of CONFIGS(today, start)) {
    const property: Property = {
      id: uuid(), user_id: userId, name: c.name, city: c.city, country: c.country, currency: c.currency,
      address: c.address, bedrooms: c.bedrooms, capacity: c.capacity, image_url: c.image,
      airbnb_listing_id: null, ical_url: null, active: true, listed_since: start,
      purchase_price: null, purchase_costs: null, furnishing_cost: null, purchase_date: null, cleaning_cost: null,
      created_at: new Date(`${start}T09:00:00Z`).toISOString(),
    }
    bundle.properties.push(property)
    bundle.targets.push({
      id: uuid(), property_id: property.id, monthly_revenue_target: c.target.revenue,
      occupancy_target: c.target.occupancy, adr_target: c.target.adr,
    })

    // Blocages (séjours propriétaire, interventions)
    const blockDays = new Set<number>()
    for (const b of c.blocks) {
      bundle.calendarEvents.push({
        id: uuid(), property_id: property.id, external_id: null, start_date: b.from, end_date: b.to,
        event_type: 'blocked', source: 'manual', created_at: `${today}T00:00:00.000Z`,
      })
      for (let d = toDay(b.from); d < toDay(b.to); d++) blockDays.add(d)
    }

    // Séquence de séjours : l'espacement dépend de l'occupation cible du mois (saisonnalité)
    let cursor = toDay(start)
    const end = toDay(horizon)
    const todayN = toDay(today)
    while (cursor < end) {
      const month = new Date(cursor * 86_400_000).getUTCMonth()
      const o = Math.min(0.93, Math.max(0.35, c.occ[month] + (rng() - 0.5) * 0.08))
      const meanGap = (c.meanStay * (1 - o)) / o
      const gap = Math.min(16, Math.floor(-Math.log(1 - rng()) * meanGap))
      let ci = cursor + gap
      const w = STAY_LENGTHS.map((l): [number, number] => [l, Math.exp(-Math.abs(l - c.meanStay) / 2.4) * (l > 10 ? 0.35 : 1)])
      let len = weighted(w)
      // saute les blocages ; raccourcit le séjour s'il en rencontre un
      while (blockDays.has(ci)) ci++
      for (let k = 0; k < len; k++) if (blockDays.has(ci + k)) { len = Math.max(1, k); break }
      const co = ci + len
      cursor = co
      if (ci >= end) break

      const checkIn = fromDay(ci)
      const checkOut = fromDay(co)
      const future = ci > todayN
      // Plus une date est lointaine, moins elle a de chances d'être déjà réservée
      if (future && rng() > Math.max(0.12, 0.92 - (ci - todayN) / 120)) continue

      let lead = rng() < 0.2 ? Math.floor(rng() * 4) : Math.floor(-Math.log(1 - rng()) * c.meanLead)
      let booking = ci - lead
      if (booking > todayN) booking = todayN - Math.floor(rng() * 20)
      if (!future && booking >= ci) booking = ci - 1
      lead = ci - booking

      const cancelled = !future && rng() < 0.05
      const channel = weighted(c.channels as [string, number][])
      let gross = 0
      for (let d = ci; d < co; d++) {
        const wd = weekday(fromDay(d))
        const season = c.price[new Date(d * 86_400_000).getUTCMonth()]
        const weekend = wd === 4 || wd === 5 ? 1.12 : wd === 6 ? 0.98 : 0.96
        const noise = 1 + (rng() - 0.5) * 0.12
        gross += c.baseAdr * season * weekend * noise
      }
      const lenFactor = len >= 7 ? 0.92 : len <= 2 ? 1.04 : 1
      gross = Math.round((gross * lenFactor) / c.round) * c.round
      const fee = Math.round(gross * FEE[channel] * 100) / 100
      const status = cancelled ? 'cancelled' : co <= todayN ? 'completed' : 'confirmed'

      bundle.reservations.push({
        id: uuid(), property_id: property.id, external_id: code(), guest_name: pick(GUESTS),
        booking_date: fromDay(booking), check_in: checkIn, check_out: checkOut, nights: len,
        gross_revenue: cancelled ? 0 : gross, platform_fee: cancelled ? 0 : fee,
        net_revenue: cancelled ? 0 : Math.round((gross - fee) * 100) / 100,
        currency: c.currency, channel, status, source: 'demo', created_at: `${today}T00:00:00.000Z`,
      })
    }

    // Dépenses
    const exp = (
      category: ExpenseCategory, amount: number, date: string, description: string,
      recurring: RecurrenceInterval | null = null,
    ) =>
      bundle.expenses.push({
        id: uuid(), property_id: property.id, category, amount: Math.round(amount * 100) / 100, currency: c.currency,
        date, description, recurring: !!recurring, recurrence_interval: recurring, recurrence_end: null,
      })
    const mexico = c.key === 'mexico'
    const k = mexico ? 1 : 0
    // Récurrentes (une ligne, développée mois par mois par le moteur)
    exp('internet', mexico ? 899 : 29.99, start, 'Abonnement fibre', 'monthly')
    exp('insurance', mexico ? 480 : 21.4, addDays(start, 4), 'Assurance habitation + RC propriétaire', 'monthly')
    exp('condo', mexico ? 1900 : 148, addDays(start, 4), mexico ? 'Cuota de mantenimiento' : 'Charges de copropriété', 'monthly')
    exp('taxes', mexico ? 1450 : 640, addDays(start, mexico ? 20 : 45), mexico ? 'Predial (trimestriel)' : 'Taxe foncière', mexico ? 'quarterly' : 'yearly')
    // Variables : électricité & consommables chaque mois, ménage à chaque départ
    for (let m = start; m <= today; m = addMonths(m, 1)) {
      const mi = Number(m.slice(5, 7)) - 1
      const winter = [0, 1, 11].includes(mi) ? 1.25 : [5, 6, 7].includes(mi) ? 0.9 : 1
      exp('electricity', (mexico ? 560 : 66) * winter * (0.85 + rng() * 0.3), addDays(m, 8), 'Facture d’électricité')
      exp('supplies', (mexico ? 350 : 38) * (0.7 + rng() * 0.6), addDays(m, 12), 'Linge, café, produits d’accueil')
    }
    for (const r of bundle.reservations.filter((r) => r.property_id === property.id && r.status === 'completed'))
      exp('cleaning', c.cleaning, r.check_out, `Ménage — ${r.guest_name}`)
    // Ponctuelles
    exp('maintenance', [180, 850][k], addDays(start, 95), mexico ? 'Réparation fuite salle de bain' : 'Plombier — robinet cuisine')
    exp('maintenance', [95, 1200][k], addDays(start, 190), mexico ? 'Climatisation — entretien' : 'Remplacement serrure')
    exp('maintenance', [140, 600][k], addDays(start, 265), mexico ? 'Peinture murs salon' : 'Entretien chaudière')
    exp('furniture', [420, 5800][k], addDays(start, 75), mexico ? 'Matelas + sommier' : 'Canapé-lit')
    void diffDays
  }
  bundle.expenses = bundle.expenses.filter((e) => e.recurring || e.date <= today)
  return bundle
}
