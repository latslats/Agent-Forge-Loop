/** A small trend line for a KPI tile. Decorative: the tile's value and trend carry the numbers. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const width = 96
  const height = 28
  const pad = 3
  const max = Math.max(...values, 1)
  const step = (width - pad * 2) / (values.length - 1)
  const points = values.map((value, index) => ({
    x: pad + index * step,
    y: height - pad - (value / max) * (height - pad * 2),
  }))
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ')
  const last = points.at(-1) ?? { x: 0, y: 0 }

  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 text-graphite"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r={2.5} className="fill-accent" />
    </svg>
  )
}
