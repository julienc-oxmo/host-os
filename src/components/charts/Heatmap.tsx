import { fmtMonthShort } from '../../lib/format'

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

/** Heatmap mois (colonnes) × jour de semaine (lignes). `values[m][wd]`. */
export function Heatmap({ values, year, fmt, cellFmt }: { values: (number | null)[][]; year: number; fmt: (v: number) => string; cellFmt?: (v: number) => string }) {
  const flat = values.flat().filter((v): v is number => v != null)
  const max = Math.max(1e-9, ...flat)
  const min = Math.min(...flat, max)
  return (
    <div className="heat" role="table" aria-label="Heatmap">
      <div />
      {Array.from({ length: 12 }, (_, m) => <div key={m} className="hl">{fmtMonthShort(`${year}-${String(m + 1).padStart(2, '0')}-01`)}</div>)}
      {DAYS.map((d, wd) => (
        <Row key={d} label={d} cells={values.map((col) => col[wd])} max={max} min={min} fmt={fmt} cellFmt={cellFmt} />
      ))}
    </div>
  )
}

function Row({ label, cells, max, min, fmt, cellFmt }: { label: string; cells: (number | null)[]; max: number; min: number; fmt: (v: number) => string; cellFmt?: (v: number) => string }) {
  return (
    <>
      <div className="rl">{label}</div>
      {cells.map((v, i) => {
        const t = v == null ? 0 : (v - min) / (max - min || 1)
        return (
          <div
            key={i} className="cell" title={v == null ? 'Pas de données' : `${label} · ${fmt(v)}`}
            style={{ background: v == null ? 'var(--surface-2)' : `color-mix(in srgb, var(--accent) ${Math.round(8 + t * 82)}%, var(--surface))`, color: t > 0.55 ? '#fff' : 'var(--text-2)' }}
          >
            {v == null ? '' : (cellFmt ?? fmt)(v)}
          </div>
        )
      })}
    </>
  )
}
