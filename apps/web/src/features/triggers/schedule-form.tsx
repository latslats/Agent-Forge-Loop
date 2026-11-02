import { type FormEvent, useState } from 'react'
import { Button } from '../../components/ui/button.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input } from '../../components/ui/input.tsx'
import { Select } from '../../components/ui/select.tsx'
import { cn } from '../../lib/cn.ts'
import { compileDraft, describeCron, type ScheduleDraft, timeZoneOptions } from './schedule.ts'

type Mode = ScheduleDraft['mode']
type Unit = Extract<ScheduleDraft, { mode: 'interval' }>['unit']

const MODES: { value: Mode; label: string }[] = [
  { value: 'days', label: 'Days and time' },
  { value: 'interval', label: 'Repeat every' },
  { value: 'monthly', label: 'Monthly' },
]
const UNITS: { value: Unit; label: string }[] = [
  { value: 'minutes', label: 'minutes' },
  { value: 'hours', label: 'hours' },
  { value: 'days', label: 'days' },
]
// Cron day numbers, Monday first.
const DAYS: { cron: number; label: string }[] = [
  { cron: 1, label: 'Mon' },
  { cron: 2, label: 'Tue' },
  { cron: 3, label: 'Wed' },
  { cron: 4, label: 'Thu' },
  { cron: 5, label: 'Fri' },
  { cron: 6, label: 'Sat' },
  { cron: 0, label: 'Sun' },
]

const isMode = (value: string): value is Mode => MODES.some((mode) => mode.value === value)
const isUnit = (value: string): value is Unit => UNITS.some((unit) => unit.value === value)

/** The form's own zone, used until the user picks another. */
const browserZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

// The preview states the schedule in words first and the exact cron under it, so both can be checked.
export function ScheduleForm({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean
  onSubmit: (cron: string, timezone: string) => void
  onCancel: () => void
}) {
  const [zones] = useState(() => timeZoneOptions(browserZone()))
  const [timezone, setTimezone] = useState(browserZone)
  const [mode, setMode] = useState<Mode>('days')
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [time, setTime] = useState('09:00')
  const [every, setEvery] = useState(30)
  const [unit, setUnit] = useState<Unit>('minutes')
  const [day, setDay] = useState(1)

  const draft: ScheduleDraft =
    mode === 'days'
      ? { mode: 'days', days, time }
      : mode === 'interval'
        ? { mode: 'interval', every, unit }
        : { mode: 'monthly', day, time }
  const result = compileDraft(draft)

  const toggleDay = (cron: number) =>
    setDays((current) =>
      current.includes(cron) ? current.filter((d) => d !== cron) : [...current, cron],
    )

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (result.cron !== null) onSubmit(result.cron, timezone)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Repeat" htmlFor="schedule-mode">
        <Select
          id="schedule-mode"
          value={mode}
          onValueChange={(value) => isMode(value) && setMode(value)}
          options={MODES}
        />
      </Field>

      {mode === 'days' && (
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-muted">Days</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((item) => {
              const on = days.includes(item.cron)
              return (
                <button
                  key={item.cron}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(item.cron)}
                  className={cn(
                    'h-8 min-w-11 cursor-pointer rounded-control border px-2 text-sm font-medium transition-colors duration-150',
                    on
                      ? 'border-accent bg-accent-soft text-accent-ink'
                      : 'border-line text-muted hover:bg-sunken hover:text-ink',
                  )}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      {mode === 'interval' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Every" htmlFor="schedule-every">
            <Input
              id="schedule-every"
              type="number"
              min={1}
              value={Number.isNaN(every) ? '' : every}
              onChange={(event) => setEvery(event.target.valueAsNumber)}
            />
          </Field>
          <Field label="Unit" htmlFor="schedule-unit">
            <Select
              id="schedule-unit"
              value={unit}
              onValueChange={(value) => isUnit(value) && setUnit(value)}
              options={UNITS}
            />
          </Field>
        </div>
      )}

      {mode === 'monthly' && (
        <Field label="Day of month" htmlFor="schedule-day" hint="Days 1 to 28 happen every month.">
          <Input
            id="schedule-day"
            type="number"
            min={1}
            max={28}
            value={day}
            onChange={(event) => setDay(event.target.valueAsNumber)}
          />
        </Field>
      )}

      {mode !== 'interval' && (
        <Field label="Time" htmlFor="schedule-time">
          <Input
            id="schedule-time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </Field>
      )}

      <Field label="Time zone" htmlFor="schedule-zone">
        <Select id="schedule-zone" value={timezone} onValueChange={setTimezone} options={zones} />
      </Field>

      <div className="rounded-control bg-sunken px-3 py-2.5">
        {result.cron === null ? (
          <p className="text-sm text-muted">{result.error}</p>
        ) : (
          <>
            <p className="text-sm font-medium">{describeCron(result.cron, timezone)}</p>
            <p className="mt-0.5 font-mono text-xs text-muted">{result.cron}</p>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={result.cron === null || pending}>
          {pending ? 'Adding…' : 'Add schedule'}
        </Button>
      </div>
    </form>
  )
}
