import { useState } from 'react'
import { niceTicks, useWidth } from './useSize'

export interface Series {
  name: string
  color?: string
  values: (number | null)[]
  /** Valeurs prévisionnelles / non confirmées : rendu hachuré. */
  dashedFrom?: number
}

interface Props {
  labels: string[]
  series: Series[]
  kind?: 'bar' | 'line'
  height?: number
  fmt: (v: number) => string
  axisFmt?: (v: number) => string
  /** Ligne de référence (objectif, moyenne…). */
  reference?: { value: number; label: string }
  highlight?: number
  zeroBase?: boolean
}

const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)']

export function TimeChart({ labels, series, kind = 'bar', height = 260, fmt, axisFmt, reference, highlight, zeroBase = true }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const m = { t: 12, r: 8, b: 26, l: width < 480 ? 44 : 56 }
  const w = Math.max(100, width - m.l - m.r)
  const h = height - m.t - m.b
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null))
  if (reference) all.push(reference.value)
  let min = Math.min(...all, zeroBase ? 0 : Infinity)
  let max = Math.max(...all, 0)
  if (!isFinite(min)) min = 0
  if (max === min) max = min + 1
  const ticks = niceTicks(min, max, 4)
  const lo = Math.min(min, ticks[0])
  const hi = Math.max(max, ticks[ticks.length - 1])
  const y = (v: number) => m.t + h - ((v - lo) / (hi - lo)) * h
  const n = labels.length
  const band = w / Math.max(1, n)
  const x = (i: number) => m.l + band * i + band / 2
  const barW = Math.min(46, (band * 0.62) / (kind === 'bar' ? series.length : 1))
  const every = Math.ceil(n / Math.max(2, Math.floor(w / 54)))
  const af = axisFmt ?? fmt

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - rect.left - m.l) / band)
    setHover(i >= 0 && i < n ? i : null)
  }

  return (
    <div className="chart" ref={ref} style={{ height }}>
      <svg width={width} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'zero-line' : 'grid-line'} x1={m.l} x2={m.l + w} y1={y(t)} y2={y(t)} />
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end">{af(t)}</text>
          </g>
        ))}
        {reference && (
          <g>
            <line x1={m.l} x2={m.l + w} y1={y(reference.value)} y2={y(reference.value)} stroke="var(--c3)" strokeDasharray="4 4" strokeWidth="1.5" />
            <text x={m.l + w} y={y(reference.value) - 5} textAnchor="end" style={{ fill: 'var(--warn)' }}>{reference.label}</text>
          </g>
        )}
        {hover != null && <rect x={m.l + band * hover} y={m.t} width={band} height={h} fill="var(--surface-2)" opacity={0.7} rx={6} />}
        {kind === 'bar' &&
          series.map((s, si) =>
            s.values.map((v, i) => {
              if (v == null) return null
              const bx = x(i) - (barW * series.length) / 2 + si * barW
              const y0 = y(Math.max(0, lo))
              const yv = y(v)
              const faded = s.dashedFrom != null && i >= s.dashedFrom
              return (
                <rect
                  key={`${si}-${i}`} x={bx + 1} width={Math.max(2, barW - 2)} y={Math.min(yv, y(0))} height={Math.max(1, Math.abs(yv - y(0)))}
                  rx={4} fill={s.color ?? COLORS[si % 4]} opacity={faded ? 0.45 : highlight != null && highlight !== i ? 0.55 : 1}
                  style={{ transition: 'all 0.4s cubic-bezier(.2,.8,.2,1)' }}
                />
              )
            }),
          )}
        {kind === 'line' &&
          series.map((s, si) => {
            const color = s.color ?? COLORS[si % 4]
            const pts = s.values.map((v, i) => (v == null ? null : ([x(i), y(v)] as const)))
            const segs: string[] = []
            let cur = ''
            pts.forEach((p) => {
              if (!p) { if (cur) segs.push(cur); cur = ''; return }
              cur += `${cur ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`
            })
            if (cur) segs.push(cur)
            return (
              <g key={si}>
                {si === 0 && series.length === 1 && pts.filter(Boolean).length > 1 && (
                  <path d={`${segs.join('')}L${(pts.filter(Boolean).slice(-1)[0] as readonly number[])[0]},${y(Math.max(lo, 0))}L${(pts.find(Boolean) as readonly number[])[0]},${y(Math.max(lo, 0))}Z`} fill={color} opacity={0.08} />
                )}
                {segs.map((d, k) => <path key={k} d={d} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />)}
                {pts.map((p, i) => p && (hover === i || n <= 14) && <circle key={i} cx={p[0]} cy={p[1]} r={hover === i ? 4.5 : 3} fill="var(--surface)" stroke={color} strokeWidth={2} />)}
              </g>
            )
          })}
        {labels.map((l, i) => i % every === 0 && <text key={i} x={x(i)} y={height - 6} textAnchor="middle">{l}</text>)}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(hover), 70), width - 70), top: m.t + 4 }}>
          <div className="t">{labels[hover]}</div>
          {series.map((s, si) => (
            <div className="l" key={si}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: s.color ?? COLORS[si % 4] }} />{series.length > 1 ? s.name : ''}</span>
              <b>{s.values[hover] == null ? '—' : fmt(s.values[hover] as number)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Legend({ items }: { items: { name: string; color?: string }[] }) {
  return <div className="legend">{items.map((s, i) => <span key={s.name}><i style={{ background: s.color ?? COLORS[i % 4] }} />{s.name}</span>)}</div>
}
