export function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-control bg-sunken px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate text-base font-semibold tabular-nums" title={value}>
        {value}
      </dd>
      {detail && <p className="text-xs text-muted tabular-nums">{detail}</p>}
    </div>
  )
}
