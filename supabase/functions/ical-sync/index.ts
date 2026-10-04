// Edge Function : synchronise les flux iCal d'un logement vers calendar_events.
// Lit uniquement les URLs iCal fournies par l'utilisateur (export officiel). AUCUN scraping.
// Déploiement : supabase functions deploy ical-sync
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { classifyEvent, parseIcs } from '../_shared/ical.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  // Le JWT de l'utilisateur est transmis : la RLS garantit qu'il ne touche que ses logements.
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { property_id } = await req.json().catch(() => ({}))
  if (!property_id) return json({ error: 'property_id requis' }, 400)

  const { data: prop, error } = await sb.from('properties').select('id, ical_url').eq('id', property_id).single()
  if (error || !prop) return json({ error: 'Logement introuvable' }, 404)
  const { data: cals } = await sb.from('property_calendars').select('*').eq('property_id', property_id)

  const feeds = [
    ...(prop.ical_url ? [{ id: null as string | null, url: prop.ical_url as string, source: 'airbnb_ical' }] : []),
    ...(cals ?? []).map((c: { id: string; url: string; source: string }) => ({ id: c.id, url: c.url, source: c.source === 'airbnb_ical' ? 'airbnb_ical' : `ical:${c.id}` })),
  ]
  let total = 0
  for (const f of feeds) {
    let status = 'ok'
    try {
      const res = await fetch(f.url, { headers: { Accept: 'text/calendar' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const events = parseIcs(await res.text())
      await sb.from('calendar_events').delete().eq('property_id', property_id).eq('source', f.source)
      if (events.length) {
        const { error: e } = await sb.from('calendar_events').insert(
          events.map((ev) => ({ property_id, source: f.source, external_id: ev.uid, start_date: ev.start, end_date: ev.end, event_type: classifyEvent(ev) })),
        )
        if (e) throw new Error(e.message)
      }
      total += events.length
    } catch (e) {
      status = `erreur: ${(e as Error).message}`
    }
    if (f.id) await sb.from('property_calendars').update({ last_synced_at: new Date().toISOString(), last_status: status }).eq('id', f.id)
  }
  return json({ events: total })
})
