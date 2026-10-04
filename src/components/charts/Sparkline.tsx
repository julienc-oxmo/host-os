export function Sparkline({ values, width = 90, height = 28, color = 'var(--accent)' }: { values: (number | null)[]; width?: number; height?: number; color?: string }) {
  const v = values.map((x) => x ?? 0)
  if (v.length < 2) return null
  const min = Math.min(...v)
  const max = Math.max(...v)
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * width},${height - 2 - ((x - min) / (max - min || 1)) * (height - 4)}`)
  return (
    <svg width={width} height={height} aria-hidden>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
