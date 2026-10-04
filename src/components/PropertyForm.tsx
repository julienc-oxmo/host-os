import { useState } from 'react'
import { useApp } from '../data/AppContext'
import { Field } from './ui'
import { CURRENCIES, type Currency, type Property } from '../lib/types'

export function PropertyForm({ property, onDone }: { property?: Property; onDone: () => void }) {
  const { repo, run, ds } = useApp()
  const [f, setF] = useState({
    name: property?.name ?? '', city: property?.city ?? '', country: property?.country ?? '', currency: (property?.currency ?? ds.profile.main_currency) as Currency,
    address: property?.address ?? '', bedrooms: property?.bedrooms ?? 1, capacity: property?.capacity ?? 2, image_url: property?.image_url ?? '',
    airbnb_listing_id: property?.airbnb_listing_id ?? '', ical_url: property?.ical_url ?? '', active: property?.active ?? true, listed_since: property?.listed_since ?? '',
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      ...(property ? { id: property.id } : {}), name: f.name.trim(), city: f.city || null, country: f.country || null, currency: f.currency,
      address: f.address || null, bedrooms: Number(f.bedrooms), capacity: Number(f.capacity), image_url: f.image_url || null,
      airbnb_listing_id: f.airbnb_listing_id || null, ical_url: f.ical_url || null, active: f.active, listed_since: f.listed_since || null,
    }
    await run(() => repo.saveProperty(payload), property ? 'Logement mis à jour' : 'Logement créé')
    onDone()
  }
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <Field label="Nom" className="full"><input className="input" required value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Appartement Lisbonne" /></Field>
        <Field label="Ville"><input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="Pays"><input className="input" value={f.country} onChange={(e) => set('country', e.target.value)} /></Field>
        <Field label="Devise du logement"><select className="select" style={{ width: '100%' }} value={f.currency} onChange={(e) => set('currency', e.target.value as Currency)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="En ligne depuis"><input className="input" type="date" value={f.listed_since} onChange={(e) => set('listed_since', e.target.value)} /></Field>
        <Field label="Chambres"><input className="input" type="number" min={0} value={f.bedrooms} onChange={(e) => set('bedrooms', +e.target.value)} /></Field>
        <Field label="Capacité (voyageurs)"><input className="input" type="number" min={1} value={f.capacity} onChange={(e) => set('capacity', +e.target.value)} /></Field>
        <Field label="Adresse" className="full"><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="URL de la photo" className="full"><input className="input" value={f.image_url} onChange={(e) => set('image_url', e.target.value)} placeholder="https://…" /></Field>
        <Field label="ID de l’annonce Airbnb"><input className="input" value={f.airbnb_listing_id} onChange={(e) => set('airbnb_listing_id', e.target.value)} /></Field>
        <Field label="URL iCal Airbnb"><input className="input" value={f.ical_url} onChange={(e) => set('ical_url', e.target.value)} placeholder="https://www.airbnb.com/calendar/ical/…" /></Field>
        <label className="check full"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />Logement actif</label>
      </div>
      <div className="modal-foot"><button className="btn primary" disabled={!f.name.trim()}>{property ? 'Enregistrer' : 'Créer le logement'}</button></div>
    </form>
  )
}
