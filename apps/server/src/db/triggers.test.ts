import { describe, expect, it } from 'vitest'
import { createAgent } from './agents.ts'
import { migrate, openDb } from './sqlite.ts'
import {
  createTrigger,
  findWebhook,
  newSecret,
  scheduleProblem,
  scheduleSkipReason,
  secretMatches,
} from './triggers.ts'

const setup = () => {
  const db = openDb(':memory:')
  migrate(db)
  const agent = createAgent(db, { name: 'Triggered', description: '' })
  return { db, agentId: agent.id }
}

describe('newSecret and secretMatches', () => {
  it('makes a 32-character hex secret, different each time', () => {
    const first = newSecret()
    expect(first).toMatch(/^[0-9a-f]{32}$/)
    expect(newSecret()).not.toBe(first)
  })

  it('matches only the same secret', () => {
    const secret = newSecret()
    expect(secretMatches(secret, secret)).toBe(true)
    expect(secretMatches(secret, `${secret}0`)).toBe(false)
    expect(secretMatches(secret, secret.slice(1))).toBe(false)
    expect(secretMatches(secret, 'x'.repeat(32))).toBe(false)
  })
})

describe('scheduleProblem', () => {
  it('accepts a valid cron and timezone', () => {
    expect(scheduleProblem('*/30 * * * *', 'Europe/Berlin')).toBeNull()
  })

  it('reports an invalid cron', () => {
    expect(scheduleProblem('every day', 'UTC')).toBe('invalid cron')
  })

  it('reports an invalid timezone', () => {
    expect(scheduleProblem('0 9 * * *', 'Mars/Olympus')).toBe('invalid timezone')
  })
})

describe('webhook triggers', () => {
  it('gives a webhook a secret and a hook URL, and a schedule neither', () => {
    const { db, agentId } = setup()
    const hook = createTrigger(db, agentId, { kind: 'webhook' })
    const schedule = createTrigger(db, agentId, {
      kind: 'schedule',
      cron: '0 9 * * *',
      timezone: 'UTC',
    })

    expect(hook.config.kind).toBe('webhook')
    expect(hook.config).toMatchObject({ secret: expect.stringMatching(/^[0-9a-f]{32}$/) })
    expect(hook.webhookUrl).toBe(
      `/hooks/${agentId}/${hook.config.kind === 'webhook' ? hook.config.secret : ''}`,
    )
    expect(schedule.webhookUrl).toBeNull()
  })

  it('finds only the enabled webhook whose secret matches', () => {
    const { db, agentId } = setup()
    const hook = createTrigger(db, agentId, { kind: 'webhook' })
    const secret = hook.config.kind === 'webhook' ? hook.config.secret : ''

    expect(findWebhook(db, agentId, secret)?.id).toBe(hook.id)
    expect(findWebhook(db, agentId, 'wrong')).toBeUndefined()
    expect(findWebhook(db, 'other-agent', secret)).toBeUndefined()
  })
})

describe('scheduleSkipReason', () => {
  it('skips a deleted agent, a paused agent and an agent with no version', () => {
    const { db, agentId } = setup()
    expect(scheduleSkipReason(db, agentId)).toBe('agent has no version')
    expect(scheduleSkipReason(db, 'missing')).toBe('agent deleted')
    db.prepare("UPDATE agents SET status = 'paused', current_version = 1 WHERE id = ?").run(agentId)
    expect(scheduleSkipReason(db, agentId)).toBe('agent is paused')
    db.prepare("UPDATE agents SET status = 'active' WHERE id = ?").run(agentId)
    expect(scheduleSkipReason(db, agentId)).toBeNull()
  })
})
