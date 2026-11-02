import { WINDOWS, type WindowDays } from '../../api/insights.ts'
import { cn } from '../../lib/cn.ts'

export function WindowSelect({
  value,
  onChange,
}: {
  value: WindowDays
  onChange: (days: WindowDays) => void
}) {
  return (
    <fieldset
      aria-label="Time window"
      className="inline-flex rounded-control border border-line bg-panel p-0.5"
    >
      {WINDOWS.map((days) => (
        <button
          key={days}
          type="button"
          aria-pressed={value === days}
          onClick={() => onChange(days)}
          className={cn(
            'h-7 rounded-control px-3 text-xs font-medium transition-colors',
            value === days ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:text-ink',
          )}
        >
          {days} days
        </button>
      ))}
    </fieldset>
  )
}
