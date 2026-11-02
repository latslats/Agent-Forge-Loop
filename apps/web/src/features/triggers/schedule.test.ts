import type { TriggerView } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { compileDraft, describeCron, summarizeTriggers, timeZoneOptions } from './schedule.ts'

describe('describeCron', () => {
  it('summarises repeating intervals', () => {
    expect(describeCron('*/30 * * * *', 'UTC')).toBe('Every 30 min')
    expect(describeCron('* * * * *', 'UTC')).toBe('Every minute')
    expect(describeCron('0 */2 * * *', 'UTC')).toBe('Every 2 hours')
    expect(describeCron('0 * * * *', 'UTC')).toBe('0 * * * * (UTC)')
    expect(describeCron('0 0 */3 * *', 'UTC')).toBe('Every 3 days')
    expect(describeCron('0 0 */1 * *', 'UTC')).toBe('Every day')
  })

  it('summarises days and times in the trigger time zone', () => {
    expect(describeCron('0 9 * * 1,2,3,4,5', 'UTC')).toBe('Mon–Fri 09:00 UTC')
    expect(describeCron('0 9 * * *', 'Europe/Berlin')).toBe('Every day 09:00 Europe/Berlin')
    expect(describeCron('0 9 * * 1,3', 'UTC')).toBe('Mon, Wed 09:00 UTC')
    expect(describeCron('30 8 * * 0,6', 'UTC')).toBe('Sat–Sun 08:30 UTC')
    expect(describeCron('0 17 * * 7', 'UTC')).toBe('Sun 17:00 UTC')
  })

  it('summarises a monthly day', () => {
    expect(describeCron('30 8 15 * *', 'UTC')).toBe('Monthly on day 15 at 08:30 UTC')
  })

  it('falls back to the raw cron for shapes it does not name', () => {
    expect(describeCron('0 9 1-5 * *', 'UTC')).toBe('0 9 1-5 * * (UTC)')
    expect(describeCron('bogus', 'UTC')).toBe('bogus (UTC)')
  })
})

describe('compileDraft', () => {
  it('builds a day and time cron with Monday-first days, or * for every day', () => {
    expect(compileDraft({ mode: 'days', days: [5, 1, 3, 2, 4], time: '09:00' })).toEqual({
      cron: '0 9 * * 1,2,3,4,5',
      error: null,
    })
    expect(compileDraft({ mode: 'days', days: [0, 1, 2, 3, 4, 5, 6], time: '18:05' })).toEqual({
      cron: '5 18 * * *',
      error: null,
    })
  })

  it('builds fixed interval crons for minutes, hours and days', () => {
    expect(compileDraft({ mode: 'interval', every: 30, unit: 'minutes' }).cron).toBe('*/30 * * * *')
    expect(compileDraft({ mode: 'interval', every: 2, unit: 'hours' }).cron).toBe('0 */2 * * *')
    expect(compileDraft({ mode: 'interval', every: 3, unit: 'days' }).cron).toBe('0 0 */3 * *')
  })

  it('builds a monthly cron', () => {
    expect(compileDraft({ mode: 'monthly', day: 15, time: '08:30' })).toEqual({
      cron: '30 8 15 * *',
      error: null,
    })
  })

  it('explains what is missing instead of building a cron', () => {
    expect(compileDraft({ mode: 'days', days: [], time: '09:00' }).error).toBe(
      'Pick at least one day.',
    )
    expect(compileDraft({ mode: 'days', days: [1], time: '' }).error).toBe('Enter a time.')
    expect(compileDraft({ mode: 'interval', every: 0, unit: 'minutes' }).error).toBe(
      'Enter a whole number from 1 to 59.',
    )
    expect(compileDraft({ mode: 'interval', every: 1.5, unit: 'hours' }).error).toBe(
      'Enter a whole number from 1 to 23.',
    )
    expect(compileDraft({ mode: 'monthly', day: 29, time: '09:00' }).error).toBe(
      'Enter a day from 1 to 28.',
    )
  })

  it('round-trips through describeCron', () => {
    const cron = compileDraft({ mode: 'days', days: [1, 2, 3, 4, 5], time: '09:00' })
    expect(cron.cron && describeCron(cron.cron, 'UTC')).toBe('Mon–Fri 09:00 UTC')
  })
})

const trigger = (overrides: Partial<TriggerView>): TriggerView =>
  ({
    id: 't',
    agentId: 'a',
    kind: 'schedule',
    config: { kind: 'schedule', cron: '*/30 * * * *', timezone: 'UTC' },
    enabled: true,
    createdAt: '2026-10-13T00:00:00.000Z',
    webhookUrl: null,
    ...overrides,
  }) as TriggerView

describe('summarizeTriggers', () => {
  it('says Manual when there are no enabled triggers', () => {
    expect(summarizeTriggers([])).toBe('Manual')
    expect(summarizeTriggers([trigger({ enabled: false })])).toBe('Manual')
  })

  it('joins the enabled schedules and a webhook', () => {
    const webhook = trigger({
      kind: 'webhook',
      config: { kind: 'webhook', secret: 'abc' },
      webhookUrl: '/hooks/a/abc',
    })
    expect(summarizeTriggers([trigger({}), webhook])).toBe('Every 30 min · Webhook')
    expect(summarizeTriggers([webhook])).toBe('Webhook')
    expect(summarizeTriggers([webhook, { ...webhook, id: 'w2' }])).toBe('Webhook')
  })
})

describe('timeZoneOptions', () => {
  it('puts the browser zone first, once', () => {
    const options = timeZoneOptions('Europe/Berlin')
    expect(options[0]).toEqual({ value: 'Europe/Berlin', label: 'Europe/Berlin' })
    expect(options.filter((option) => option.value === 'Europe/Berlin')).toHaveLength(1)
    expect(timeZoneOptions('America/New_York')[0]?.label).toBe('America/New York')
  })

  it('lists UTC even though the browser does not report it as a zone', () => {
    expect(
      timeZoneOptions('Europe/Berlin').filter((option) => option.value === 'UTC'),
    ).toHaveLength(1)
  })
})
