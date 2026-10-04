import type { Currency, ReservationStatus } from '../lib/types'

/**
 * Couche d'importation indépendante de la source.
 * Toute source (CSV Airbnb, PMS Guesty/Hostaway/Lodgify, API perso, webhook) produit des
 * `NormalizedReservation`, puis `ingestReservations` s'occupe du reste (dédoublonnage par identifiant externe).
 */
export interface NormalizedReservation {
  external_id: string
  /** Libellé du logement côté source (nom d'annonce, id PMS…) — résolu vers un logement Host OS. */
  property_ref: string | null
  guest_name: string | null
  booking_date: string | null
  check_in: string
  check_out: string
  gross_revenue: number
  platform_fee: number
  net_revenue: number
  currency: Currency | null
  channel: string
  status: ReservationStatus
}

export type ImportSourceId = 'airbnb_csv' | 'ical' | 'guesty' | 'hostaway' | 'lodgify' | 'custom_api'

export interface ImportSourceInfo {
  id: ImportSourceId
  label: string
  description: string
  status: 'available' | 'structure' | 'planned'
}

export const IMPORT_SOURCES: ImportSourceInfo[] = [
  { id: 'airbnb_csv', label: 'Airbnb — export CSV', description: 'Réservations ou historique des transactions exportés depuis Airbnb.', status: 'available' },
  { id: 'ical', label: 'Calendrier iCal', description: 'Disponibilités et nuits réservées via un flux iCal (Airbnb ou autre).', status: 'structure' },
  { id: 'guesty', label: 'Guesty', description: 'Connecteur PMS — l’adaptateur produira des NormalizedReservation.', status: 'planned' },
  { id: 'hostaway', label: 'Hostaway', description: 'Connecteur PMS — l’adaptateur produira des NormalizedReservation.', status: 'planned' },
  { id: 'lodgify', label: 'Lodgify', description: 'Connecteur PMS — l’adaptateur produira des NormalizedReservation.', status: 'planned' },
  { id: 'custom_api', label: 'API / webhook personnalisé', description: 'Edge Function « ingest-reservations » prête à recevoir des réservations normalisées.', status: 'structure' },
]
