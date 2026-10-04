// Parseur iCal minimal et sans dépendance (utilisable côté Deno ET côté navigateur).
// Il lit un flux .ics fourni par l'utilisateur (export officiel de calendrier). Aucun scraping.

export interface ICalEvent {
  uid: string
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD, exclusif (jour de départ)
  summary: string
}

const toIsoDate = (v: string): string | null => {
  const m = v.match(/(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
const plusOne = (d: string) => new Date(Date.parse(d + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10)

export function parseIcs(text: string): ICalEvent[] {
  // Dé-pliage des lignes (RFC 5545 : une ligne qui commence par un espace/tab prolonge la précédente)
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const events: ICalEvent[] = []
  let cur: Partial<ICalEvent> | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {}
    else if (line === 'END:VEVENT') {
      if (cur?.start) {
        let end = cur.end && cur.end > cur.start ? cur.end : plusOne(cur.start)
        events.push({ uid: cur.uid ?? `${cur.start}_${end}`, start: cur.start, end, summary: cur.summary ?? '' })
      }
      cur = null
    } else if (cur) {
      const idx = line.indexOf(':')
      if (idx < 0) continue
      const name = line.slice(0, idx).split(';')[0].toUpperCase()
      const value = line.slice(idx + 1).trim()
      if (name === 'UID') cur.uid = value
      else if (name === 'SUMMARY') cur.summary = value.replace(/\\,/g, ',')
      else if (name === 'DTSTART') cur.start = toIsoDate(value) ?? undefined
      else if (name === 'DTEND') cur.end = toIsoDate(value) ?? undefined
    }
  }
  return events
}

/** « Reserved » → nuit réservée ; « Not available » / tout le reste → blocage. */
export function classifyEvent(ev: ICalEvent): 'reserved' | 'blocked' {
  return /reserved|booked|booking|réserv|reserva/i.test(ev.summary) && !/not available|unavailable/i.test(ev.summary)
    ? 'reserved'
    : 'blocked'
}
