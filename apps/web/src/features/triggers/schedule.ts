import type { TriggerView } from '@agentforgeloop/shared'

// Pure schedule logic: builds cron from the form, and reads a plain-language summary back from cron.
// Cron day numbers are 0 = Sunday to 6 = Saturday; 7 also means Sunday.

type Day = { cron: number; name: string }

/** Monday first, the order people read a week in. */
const WEEK: readonly Day[] = [
  { cron: 1, name: 'Mon' },
  { cron: 2, name: 'Tue' },
  { cron: 3, name: 'Wed' },
  { cron: 4, name: 'Thu' },
  { cron: 5, name: 'Fri' },
  { cron: 6, name: 'Sat' },
  { cron: 0, name: 'Sun' },
]

const pad = (n: number): string => String(n).padStart(2, '0')

const int = (text: string): number | null => (/^\d+$/.test(text) ? Number(text) : null)

const everyN = (text: string): number | null => {
  const match = /^\*\/(\d+)$/.exec(text)
  return match ? Number(match[1]) : null
}

/** "Mon–Fri", "Mon, Wed" or "Sat–Sun": runs of two or more days become a range. */
const weekText = (cronDays: number[]): string => {
  const picked = WEEK.filter((day) => cronDays.includes(day.cron))
  const runs: Day[][] = []
  for (const day of picked) {
    const run = runs.at(-1)
    const last = run?.at(-1)
    if (run && last && WEEK.indexOf(last) + 1 === WEEK.indexOf(day)) run.push(day)
    else runs.push([day])
  }
  return runs
    .map((run) => {
      const first = run[0]?.name ?? ''
      const end = run.at(-1)?.name ?? ''
      return run.length > 1 ? `${first}–${end}` : first
    })
    .join(', ')
}

/** Cron day list ("1,2,5") to week days, or null when the field is not a plain list. */
const parseDays = (text: string): number[] | null => {
  const numbers = text.split(',').map(int)
  if (numbers.some((n) => n === null || n > 7)) return null
  return numbers.map((n) => (n === 7 ? 0 : (n ?? 0)))
}

/** The plain-language summary of a cron, such as "Every 30 min" or "Mon–Fri 09:00 UTC". */
export const describeCron = (cron: string, timezone: string): string => {
  const fallback = `${cron} (${timezone})`
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return fallback
  const [minute = '', hour = '', dayOfMonth = '', month = '', dayOfWeek = ''] = fields
  if (month !== '*') return fallback

  if (dayOfMonth === '*' && dayOfWeek === '*' && hour === '*') {
    const n = minute === '*' ? 1 : everyN(minute)
    if (n !== null) return n === 1 ? 'Every minute' : `Every ${n} min`
  }
  if (dayOfMonth === '*' && dayOfWeek === '*' && minute === '0') {
    const n = everyN(hour)
    if (n !== null) return n === 1 ? 'Every hour' : `Every ${n} hours`
  }
  if (dayOfWeek === '*' && minute === '0' && hour === '0') {
    const n = everyN(dayOfMonth)
    if (n !== null) return n === 1 ? 'Every day' : `Every ${n} days`
  }

  const m = int(minute)
  const h = int(hour)
  if (m === null || h === null) return fallback
  const time = `${pad(h)}:${pad(m)} ${timezone}`

  if (dayOfMonth === '*') {
    if (dayOfWeek === '*') return `Every day ${time}`
    const days = parseDays(dayOfWeek)
    return days ? `${weekText(days)} ${time}` : fallback
  }
  const date = int(dayOfMonth)
  if (date !== null && dayOfWeek === '*') return `Monthly on day ${date} at ${time}`
  return fallback
}

export type ScheduleDraft =
  | { mode: 'days'; days: number[]; time: string }
  | { mode: 'interval'; every: number; unit: 'minutes' | 'hours' | 'days' }
  | { mode: 'monthly'; day: number; time: string }

export type Compiled = { cron: string; error: null } | { cron: null; error: string }

const INTERVAL_MAX = { minutes: 59, hours: 23, days: 31 } as const
const TIME = /^(\d{2}):(\d{2})$/

const ok = (cron: string): Compiled => ({ cron, error: null })
const fail = (error: string): Compiled => ({ cron: null, error })

/** The cron for the schedule form, or the reason it cannot be built yet. */
export const compileDraft = (draft: ScheduleDraft): Compiled => {
  if (draft.mode === 'interval') {
    const max = INTERVAL_MAX[draft.unit]
    if (!Number.isInteger(draft.every) || draft.every < 1 || draft.every > max)
      return fail(`Enter a whole number from 1 to ${max}.`)
    const n = draft.every
    if (draft.unit === 'minutes') return ok(`*/${n} * * * *`)
    if (draft.unit === 'hours') return ok(`0 */${n} * * *`)
    return ok(`0 0 */${n} * *`)
  }

  const time = TIME.exec(draft.time)
  if (!time) return fail('Enter a time.')
  const hour = Number(time[1])
  const minute = Number(time[2])
  if (hour > 23 || minute > 59) return fail('Enter a valid time.')

  if (draft.mode === 'monthly') {
    if (!Number.isInteger(draft.day) || draft.day < 1 || draft.day > 28)
      return fail('Enter a day from 1 to 28.')
    return ok(`${minute} ${hour} ${draft.day} * *`)
  }

  if (draft.days.length === 0) return fail('Pick at least one day.')
  const dayOfWeek =
    draft.days.length === 7
      ? '*'
      : WEEK.filter((day) => draft.days.includes(day.cron))
          .map((day) => day.cron)
          .join(',')
  return ok(`${minute} ${hour} * * ${dayOfWeek}`)
}

/** The summaries of the enabled triggers, each shown once. No enabled trigger means manual only. */
export const summarizeTriggers = (triggers: TriggerView[]): string => {
  const parts = triggers
    .filter((trigger) => trigger.enabled)
    .map((trigger) =>
      trigger.config.kind === 'schedule'
        ? describeCron(trigger.config.cron, trigger.config.timezone)
        : 'Webhook',
    )
  return parts.length > 0 ? [...new Set(parts)].join(' · ') : 'Manual'
}

/** Every IANA zone the browser knows, with the browser's own zone first. UTC is listed too. */
export const timeZoneOptions = (browserZone: string): { value: string; label: string }[] =>
  [...new Set([browserZone, 'UTC', ...Intl.supportedValuesOf('timeZone')])].map((zone) => ({
    value: zone,
    label: zone.replaceAll('_', ' '),
  }))
