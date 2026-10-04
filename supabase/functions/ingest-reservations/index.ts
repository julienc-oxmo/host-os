// Edge Function : point d'entrée générique pour PMS / webhooks / API personnalisée.
// Reçoit des réservations NORMALISÉES (même format que src/imports/types.ts) et les insère
// de façon idempotente (index unique property_id + external_id). Un adaptateur Guesty/Hostaway/Lodgify
// n'a qu'à convertir son payload vers ce format.
//
// POST { property_id, source, reservations: NormalizedReservation[] }   (Authorization: Bearer <JWT utilisateur>)
// Déploiement : supabase functions deploy ingest-reservations
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { property_id, source = 'api', reservations } = await req.json().catch(() => ({}))
  if (!property_id || !Array.isArray(reservations)) return json({ error: 'property_id et reservations[] requis' }, 400)

  const rows = reservations
    .filter((r: any) => r.external_id && r.check_in && r.check_out && r.check_out > r.check_in)
    .map((r: any) => ({
      property_id, source, external_id: String(r.external_id), guest_name: r.guest_name ?? null, booking_date: r.booking_date ?? null,
      check_in: r.check_in, check_out: r.check_out, gross_revenue: r.gross_revenue ?? 0, platform_fee: r.platform_fee ?? 0,
      net_revenue: r.net_revenue ?? (r.gross_revenue ?? 0) - (r.platform_fee ?? 0), currency: r.currency ?? 'EUR',
      channel: r.channel ?? 'other', status: r.status ?? 'confirmed',
    }))
  const { error } = await sb.from('reservations').upsert(rows, { onConflict: 'property_id,external_id', ignoreDuplicates: true })
  if (error) return json({ error: error.message }, 400)
  await sb.from('imports').insert({ user_id: (await sb.auth.getUser()).data.user?.id, filename: `webhook:${source}`, source, rows_imported: rows.length, duplicates: reservations.length - rows.length })
  return json({ received: reservations.length, valid: rows.length })
})
