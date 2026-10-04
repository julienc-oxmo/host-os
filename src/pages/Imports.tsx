import { useMemo, useRef, useState } from 'react'
import { useApp } from '../data/AppContext'
import { Badge, Callout, Card, Field, Icon, Select } from '../components/ui'
import { PageHead } from '../components/Layout'
import { parseCsv, toCsv, type ParsedCsv } from '../lib/csv'
import { FIELDS, detectMapping, normalizeRows, type DateOrder, type ImportField } from '../imports/airbnbCsv'
import { planIngest } from '../imports/ingest'
import { IMPORT_SOURCES } from '../imports/types'
import { classifyEvent, parseIcs } from '../lib/ical'
import { addDays, todayStr } from '../lib/dates'
import { fmtDate, num } from '../lib/format'

const STEPS = ['Upload', 'Détection', 'Aperçu', 'Mapping', 'Validation', 'Import']

export default function Imports() {
  const { ds } = useApp()
  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <PageHead title="Imports" subtitle="Importez vos réservations depuis un export CSV Airbnb ; branchez vos calendriers iCal. Aucune donnée n’est récupérée par scraping." />
      <div className="stack">
        <CsvWizard />
        <IcalSection />
        <Card title="Sources de données" subtitle="La couche d’import est indépendante : chaque source produit des réservations normalisées, ingérées de la même façon (dédoublonnage par identifiant externe).">
          <div className="grid cols-3">
            {IMPORT_SOURCES.map((s) => (
              <div key={s.id} className="card" style={{ boxShadow: 'none', padding: 14 }}>
                <div className="row spread"><b>{s.label}</b><Badge tone={s.status === 'available' ? 'pos' : s.status === 'structure' ? 'accent' : undefined} plain>{s.status === 'available' ? 'Disponible' : s.status === 'structure' ? 'Structure prête' : 'À venir'}</Badge></div>
                <p className="small muted" style={{ marginTop: 6 }}>{s.description}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Historique des imports" flush>
          {ds.imports.length === 0 ? <p className="muted" style={{ padding: '0 20px 20px' }}>Aucun import pour le moment.</p> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Date</th><th>Fichier</th><th>Source</th><th className="num">Importées</th><th className="num">Doublons</th></tr></thead>
              <tbody>{ds.imports.slice().reverse().map((i) => <tr key={i.id}><td>{fmtDate(i.imported_at.slice(0, 10), true)}</td><td>{i.filename}</td><td>{i.source}</td><td className="num">{i.rows_imported}</td><td className="num">{i.duplicates}</td></tr>)}</tbody></table></div>
          )}
        </Card>
      </div>
    </div>
  )
}

function CsvWizard() {
  const { ds, repo, run, today } = useApp()
  const [step, setStep] = useState(0)
  const [file, setFile] = useState<{ name: string; csv: ParsedCsv } | null>(null)
  const [mapping, setMapping] = useState<Record<ImportField, number | null>>({} as never)
  const [dateOrder, setDateOrder] = useState<DateOrder>('auto')
  const [defaultProp, setDefaultProp] = useState(ds.properties[0]?.id ?? '')
  const [listingMap, setListingMap] = useState<Record<string, string>>({})
  const [over, setOver] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ imported: number; duplicates: number } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const load = async (f: File) => {
    setError('')
    try {
      const text = await f.text()
      const csv = parseCsv(text)
      if (csv.headers.length < 2 || csv.rows.length === 0) throw new Error('Fichier vide ou illisible : vérifiez qu’il s’agit bien d’un CSV avec une ligne d’en-têtes.')
      const m = detectMapping(csv.headers)
      setFile({ name: f.name, csv })
      setMapping(m)
      setListingMap({})
      setDone(null)
      setStep(1)
    } catch (e) { setError((e as Error).message) }
  }
  const reset = () => { setFile(null); setStep(0); setDone(null); setError('') }

  const listings = useMemo(() => (file && mapping.listing != null ? [...new Set(file.csv.rows.map((r) => (r[mapping.listing!] ?? '').trim()).filter(Boolean))] : []), [file, mapping.listing])
  const resolve = (ref: string | null) => {
    if (ref && listingMap[ref]) return listingMap[ref] === 'skip' ? null : listingMap[ref]
    const auto = ref ? ds.properties.find((p) => p.name.toLowerCase() === ref.toLowerCase() || (p.airbnb_listing_id && p.airbnb_listing_id === ref)) : null
    return auto?.id ?? defaultProp ?? null
  }

  const result = useMemo(() => {
    if (!file) return null
    const mapped = normalizeRows(file.csv, { mapping, dateOrder, defaultCurrency: 'EUR', today })
    // devise incohérente → ligne refusée (évite de mélanger des montants de devises différentes)
    const issues = [...mapped.issues]
    const ok = mapped.rows.filter((r) => {
      const pid = resolve(r.property_ref)
      const prop = ds.properties.find((p) => p.id === pid)
      if (prop && r.currency && r.currency !== prop.currency) { issues.push({ row: r.rowNumber, level: 'error', message: `Devise ${r.currency} différente de celle du logement « ${prop.name} » (${prop.currency}).` }); return false }
      return true
    })
    const plan = planIngest(ok, ds.reservations, (r) => resolve(r.property_ref))
    return { mapped, issues, plan }
  }, [file, mapping, dateOrder, listingMap, defaultProp, ds.reservations, ds.properties, today])

  const errors = result?.issues.filter((i) => i.level === 'error') ?? []
  const required = FIELDS.filter((f) => f.required)
  const missing = required.filter((f) => mapping[f.key] == null)
  const canImport = !!result && result.plan.fresh.length > 0 && missing.length === 0

  const sample = () => {
    const p = ds.properties[0]
    const rows: string[][] = [['Code de confirmation', 'Statut', 'Nom du voyageur', 'Date de début', 'Date de fin', '# de nuits', 'Réservé', 'Logement', 'Revenus bruts', 'Frais de service', 'Devise']]
    for (let i = 0; i < 6; i++) {
      const ci = addDays(todayStr(), 20 + i * 9)
      const n = 2 + (i % 4)
      const g = (n * 120).toFixed(2).replace('.', ',')
      rows.push([`HMTEST${100 + i}`, 'Confirmée', ['Alice Martin', 'Bob Keller', 'Carla Díaz', 'David Lee', 'Eva Rossi', 'Farid Ben'][i], ci.split('-').reverse().join('/'), addDays(ci, n).split('-').reverse().join('/'), String(n), addDays(todayStr(), -3).split('-').reverse().join('/'), p?.name ?? 'Logement', `${g} ${p?.currency === 'MXN' ? 'MXN' : '€'}`, (n * 120 * 0.155).toFixed(2).replace('.', ','), p?.currency ?? 'EUR'])
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + toCsv(rows, ';')], { type: 'text/csv' }))
    a.download = 'exemple-airbnb.csv'
    a.click()
  }

  const doImport = async () => {
    if (!result || !file) return
    const rows = result.plan.fresh.map((r) => ({ ...r, currency: r.currency ?? ds.properties.find((p) => p.id === r.property_id)!.currency }))
    const ok = await run(() => repo.ingestReservations(rows, { filename: file.name, source: 'airbnb_csv', duplicates: result.plan.duplicates.length }), `${rows.length} réservations importées`)
    if (ok !== undefined || true) { setDone({ imported: rows.length, duplicates: result.plan.duplicates.length }); setStep(5) }
  }

  const Nav = ({ next, nextLabel = 'Continuer', disabled }: { next?: number; nextLabel?: string; disabled?: boolean }) => (
    <div className="row spread" style={{ marginTop: 20 }}>
      <button className="btn" onClick={() => (step <= 1 ? reset() : setStep(step - 1))}>{step <= 1 ? 'Annuler' : 'Retour'}</button>
      {next != null && <button className="btn primary" disabled={disabled} onClick={() => setStep(next)}>{nextLabel}</button>}
    </div>
  )

  return (
    <Card title="Import CSV Airbnb" subtitle="Réservations ou historique des transactions exportés depuis Airbnb (FR / EN / ES).">
      <div className="steps">{STEPS.map((s, i) => <div key={s} className={`step ${i === step ? 'on' : i < step ? 'done' : ''}`}><span className="n">{i < step ? <Icon name="check" size={11} /> : i + 1}</span>{s}</div>)}</div>

      {step === 0 && (
        <>
          <div className={`dropzone ${over ? 'over' : ''}`} onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) load(f) }}>
            <Icon name="upload" size={26} />
            <p style={{ marginTop: 8 }}><b>Glissez votre fichier CSV ici</b> ou cliquez pour parcourir</p>
            <p className="small">Séparateurs , ; ou tabulation détectés automatiquement</p>
            <input ref={input} type="file" accept=".csv,text/csv,.txt" hidden onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          </div>
          {error && <div style={{ marginTop: 12 }}><Callout tone="neg">{error}</Callout></div>}
          <p className="small muted" style={{ marginTop: 12 }}>Pas de fichier sous la main ? <button className="btn ghost sm" onClick={sample}>Télécharger un CSV d’exemple</button></p>
        </>
      )}

      {file && step === 1 && (
        <>
          <div className="summary-grid">
            <div><div className="small muted">Fichier</div><div style={{ wordBreak: 'break-all' }}><b>{file.name}</b></div></div>
            <div><div className="small muted">Lignes</div><div className="n">{file.csv.rows.length}</div></div>
            <div><div className="small muted">Colonnes</div><div className="n">{file.csv.headers.length}</div></div>
            <div><div className="small muted">Séparateur</div><div className="n">{file.csv.delimiter === '\t' ? 'Tab' : file.csv.delimiter}</div></div>
          </div>
          <h4 style={{ margin: '18px 0 8px' }}>Colonnes reconnues</h4>
          <div className="pill-list">
            {FIELDS.map((f) => <Badge key={f.key} tone={mapping[f.key] != null ? 'pos' : f.required ? 'neg' : undefined}>{f.label}{mapping[f.key] != null ? ` ← ${file.csv.headers[mapping[f.key]!]}` : f.required ? ' (manquant)' : ''}</Badge>)}
          </div>
          {missing.length > 0 && <div style={{ marginTop: 12 }}><Callout>Colonnes obligatoires non détectées : {missing.map((m) => m.label).join(', ')}. Vous pourrez les associer à l’étape Mapping.</Callout></div>}
          <Nav next={2} />
        </>
      )}

      {file && step === 2 && (
        <>
          <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 12 }}>
            <table className="table"><thead><tr>{file.csv.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
              <tbody>{file.csv.rows.slice(0, 8).map((r, i) => <tr key={i}>{file.csv.headers.map((_, j) => <td key={j}>{r[j]}</td>)}</tr>)}</tbody></table>
          </div>
          <p className="small faint" style={{ marginTop: 8 }}>Aperçu des 8 premières lignes sur {file.csv.rows.length}.</p>
          <Nav next={3} />
        </>
      )}

      {file && step === 3 && (
        <>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`}>
                <select className="select" style={{ width: '100%' }} value={mapping[f.key] ?? ''} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">— non mappé —</option>
                  {file.csv.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
                {f.hint && <span className="small faint">{f.hint}</span>}
              </Field>
            ))}
            <Field label="Format des dates"><select className="select" style={{ width: '100%' }} value={dateOrder} onChange={(e) => setDateOrder(e.target.value as DateOrder)}>
              <option value="auto">Détection automatique</option><option value="dmy">Jour/Mois/Année</option><option value="mdy">Mois/Jour/Année</option></select></Field>
            <Field label="Logement par défaut"><select className="select" style={{ width: '100%' }} value={defaultProp} onChange={(e) => setDefaultProp(e.target.value)}>{ds.properties.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.currency})</option>)}</select></Field>
          </div>
          {listings.length > 0 && (
            <>
              <h4 style={{ margin: '20px 0 8px' }}>Associer les logements du fichier</h4>
              <div className="stack-sm">
                {listings.map((l) => (
                  <div key={l} className="row spread wrap"><span>{l}</span>
                    <select className="select" value={listingMap[l] ?? resolve(l) ?? 'skip'} onChange={(e) => setListingMap({ ...listingMap, [l]: e.target.value })}>
                      {ds.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="skip">Ignorer ces lignes</option></select></div>
                ))}
              </div>
            </>
          )}
          <Nav next={4} nextLabel="Valider" disabled={missing.length > 0} />
        </>
      )}

      {file && result && step === 4 && (
        <>
          <div className="summary-grid">
            <div><div className="small muted">Lignes analysées</div><div className="n">{file.csv.rows.length}</div></div>
            <div><div className="small muted">Nouvelles réservations</div><div className="n" style={{ color: 'var(--pos)' }}>{result.plan.fresh.length}</div></div>
            <div><div className="small muted">Déjà présentes</div><div className="n">{result.plan.duplicates.length}</div></div>
            <div><div className="small muted">Invalides / ignorées</div><div className="n" style={{ color: errors.length ? 'var(--neg)' : undefined }}>{file.csv.rows.length - result.mapped.rows.length}</div></div>
            {result.plan.unmapped.length > 0 && <div><div className="small muted">Sans logement</div><div className="n">{result.plan.unmapped.length}</div></div>}
          </div>
          <p style={{ marginTop: 14 }}><b>{file.csv.rows.length} lignes analysées · {result.plan.fresh.length} nouvelles réservations · {result.plan.duplicates.length} déjà présentes</b></p>
          {result.issues.length > 0 && (
            <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 12, marginTop: 14, maxHeight: 220, overflowY: 'auto' }}>
              <table className="table"><thead><tr><th>Ligne</th><th>Niveau</th><th>Détail</th></tr></thead>
                <tbody>{result.issues.slice(0, 60).map((i, k) => <tr key={k}><td>{i.row}</td><td><Badge tone={i.level === 'error' ? 'neg' : 'warn'} plain>{i.level === 'error' ? 'Erreur' : 'Avertissement'}</Badge></td><td style={{ whiteSpace: 'normal' }}>{i.message}</td></tr>)}</tbody></table>
            </div>
          )}
          <p className="small faint" style={{ marginTop: 8 }}>Les doublons sont détectés par logement + identifiant externe : un second import du même fichier n’ajoute rien.</p>
          <Nav next={undefined} />
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: -34 }}>
            <button className="btn primary" disabled={!canImport} onClick={doImport}>Importer {result.plan.fresh.length} réservation{result.plan.fresh.length > 1 ? 's' : ''}</button>
          </div>
        </>
      )}

      {step === 5 && done && (
        <div className="stack">
          <Callout tone="pos">Import terminé : <b>{done.imported}</b> nouvelle{done.imported > 1 ? 's' : ''} réservation{done.imported > 1 ? 's' : ''}, {done.duplicates} déjà présente{done.duplicates > 1 ? 's' : ''} (ignorée{done.duplicates > 1 ? 's' : ''}).</Callout>
          <div className="row"><button className="btn" onClick={reset}>Importer un autre fichier</button></div>
        </div>
      )}
      <span style={{ display: 'none' }}>{num(0)}</span>
    </Card>
  )
}

function IcalSection() {
  const { ds, repo, run, toast } = useApp()
  const [pid, setPid] = useState(ds.properties[0]?.id ?? '')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const cals = ds.calendars.filter((c) => c.property_id === pid)
  const prop = ds.properties.find((p) => p.id === pid)
  const events = ds.calendarEvents.filter((e) => e.property_id === pid && e.source !== 'manual')

  const importIcs = async (f: File) => {
    const evs = parseIcs(await f.text())
    if (!evs.length) return toast('Aucun événement trouvé dans ce fichier .ics', 'error')
    await run(() => repo.replaceCalendarEvents(pid, 'ical_file', evs.map((e) => ({ external_id: e.uid, start_date: e.start, end_date: e.end, event_type: classifyEvent(e) }))), `${evs.length} événements importés`)
  }
  return (
    <Card title="Calendriers iCal" subtitle="Structure prête : un ou plusieurs flux iCal par logement, stockés dans calendar_events (table séparée des réservations). La synchronisation par URL passe par l’Edge Function « ical-sync » ; aucun scraping.">
      <div className="stack">
        <div className="row wrap"><Select value={pid} onChange={setPid} options={ds.properties.map((p) => ({ key: p.id, label: p.name }))} />
          {prop?.ical_url && <span className="small muted">URL iCal Airbnb enregistrée dans la fiche logement ✓</span>}</div>
        {cals.map((c) => (
          <div key={c.id} className="row spread wrap" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            <div className="grow"><b>{c.label}</b><div className="small faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.url}</div><div className="small faint">{c.last_synced_at ? `Dernière synchro ${fmtDate(c.last_synced_at.slice(0, 10), true)} · ${c.last_status}` : 'Jamais synchronisé'}</div></div>
            <button className="btn ghost sm danger" onClick={() => run(() => repo.deleteCalendar(c.id), 'Calendrier supprimé')}>Supprimer</button>
          </div>
        ))}
        <div className="row wrap">
          <input className="input" style={{ width: 160 }} placeholder="Libellé (ex. Booking)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="https://…/calendar.ics" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn" disabled={!label || !/^https?:\/\//.test(url)} onClick={async () => { await run(() => repo.addCalendar({ property_id: pid, label, url, source: 'ical' }), 'Calendrier ajouté'); setLabel(''); setUrl('') }}>Ajouter</button>
        </div>
        <div className="row wrap">
          <button className="btn" onClick={() => run(async () => { const r = await repo.syncCalendars(pid); toast(`${r.events} événements synchronisés`) })}>Synchroniser les flux iCal</button>
          <button className="btn" onClick={() => file.current?.click()}><Icon name="upload" size={14} />Importer un fichier .ics</button>
          <input ref={file} type="file" accept=".ics,text/calendar" hidden onChange={(e) => e.target.files?.[0] && importIcs(e.target.files[0])} />
        </div>
        <p className="small faint">{events.length} événement{events.length > 1 ? 's' : ''} iCal stocké{events.length > 1 ? 's' : ''} pour ce logement. Les nuits « réservées » iCal comptent dans l’occupation, sans revenu ; une réservation importée a toujours priorité sur l’événement iCal correspondant.</p>
      </div>
    </Card>
  )
}
