import { useWidth, niceTicks } from './useSize'
import type { WaterfallStep } from '../../lib/analytics'

export function Waterfall({ steps, fmt, height = 280 }: { steps: WaterfallStep[]; fmt: (v: number) => string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const m = { t: 22, r: 8, b: 44, l: width < 480 ? 6 : 6 }
  const w = width - m.l - m.r
  const h = height - m.t - m.b
  // cumul
  let run = 0
  const bars = steps.map((s) => {
    if (s.kind === 'total') { const b = { from: 0, to: s.value, step: s }; run = s.value; return b }
    const from = run
    run += s.value
    return { from, to: run, step: s }
  })
  const vals = bars.flatMap((b) => [b.from, b.to])
  const max = Math.max(...vals, 1)
  const min = Math.min(...vals, 0)
  const ticks = niceTicks(min, max, 4)
  const hi = Math.max(max, ticks[ticks.length - 1])
  const lo = Math.min(min, ticks[0])
  const y = (v: number) => m.t + h - ((v - lo) / (hi - lo || 1)) * h
  const band = w / steps.length
  const bw = Math.min(60, band * 0.6)
  return (
    <div className="chart" ref={ref} style={{ height }}>
      <svg width={width} height={height}>
        <line className="zero-line" x1={m.l} x2={m.l + w} y1={y(0)} y2={y(0)} />
        {bars.map((b, i) => {
          const cx = m.l + band * i + band / 2
          const top = y(Math.max(b.from, b.to))
          const bottom = y(Math.min(b.from, b.to))
          const total = b.step.kind === 'total'
          const fill = total ? (b.step.key === 'profit' ? (b.step.value >= 0 ? 'var(--pos)' : 'var(--neg)') : 'var(--c1)') : 'var(--c3)'
          return (
            <g key={b.step.key}>
              {i < bars.length - 1 && <line x1={cx + bw / 2} x2={cx + band - bw / 2} y1={y(b.to)} y2={y(b.to)} stroke="var(--border-strong)" strokeDasharray="3 3" />}
              <rect x={cx - bw / 2} y={top} width={bw} height={Math.max(2, bottom - top)} rx={5} fill={fill} opacity={total ? 1 : 0.85} style={{ transition: 'all .4s' }} />
              <text x={cx} y={top - 6} textAnchor="middle" style={{ fill: 'var(--text)', fontWeight: 600 }}>{fmt(b.step.value)}</text>
              <text x={cx} y={height - 22} textAnchor="middle">{b.step.label.split(' ')[0]}</text>
              {b.step.label.split(' ')[1] && <text x={cx} y={height - 9} textAnchor="middle">{b.step.label.split(' ').slice(1).join(' ')}</text>}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
