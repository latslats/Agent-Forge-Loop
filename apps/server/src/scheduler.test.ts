import { AgentDefinition, type ApprovalNode } from '@agentforgeloop/shared'
import { scheduledJobs } from 'croner'
import { afterEach, describe, expect, it } from 'vitest'
import { listApprovals } from './db/approvals.ts'
import { getRun, listEvents } from './db/runs.ts'
import { type Db, migrate, openDb } from './db/sqlite.ts'
import { createTrigger, deleteTrigger, updateTrigger } from './db/triggers.ts'
import { startRun } from './engine/executor.ts'
import { fakeLlm, publishAgent, testEngine, textMessage, waitFor } from './engine/testing.ts'
import { expireTimedOut, type Scheduler, startScheduler } from './scheduler.ts'

// A cron that fires on 1 January only, so no job fires during a test.
const NEVER_FIRES = '0 0 1 1 *'

const scheduledNames = () =>
  scheduledJobs.map((job) => job.name).filter((name) => name?.startsWith('schedule:'))

const setup = () => {
  const db: Db = openDb(':memory:')
  migrate(db)
  const deps = testEngine(
    db,
    fakeLlm(async () => textMessage('')),
  )
  return { db, deps }
}

let scheduler: Scheduler | undefined
afterEach(() => {
  scheduler?.stop()
  scheduler = undefined
})

describe('scheduler reload', () => {
  it('registers one job per enabled schedule and ignores webhooks', () => {
    const { db, deps } = setup()
    const agentId = publishAgent(
      db,
      AgentDefinition.parse({
        name: 'Daily',
        nodes: [
          { id: 'trigger', type: 'trigger', label: 'Start', position: { x: 0, y: 0 } },
          { id: 'out', type: 'output', label: 'Done', template: 'ok', position: { x: 0, y: 0 } },
        ],
        edges: [{ id: 'e1', from: 'trigger', to: 'out' }],
      }),
    )
    createTrigger(db, agentId, { kind: 'schedule', cron: NEVER_FIRES, timezone: 'UTC' })
    createTrigger(db, agentId, { kind: 'webhook' })

    scheduler = startScheduler(deps)
    expect(scheduledNames()).toHaveLength(1)

    const second = createTrigger(db, agentId, {
      kind: 'schedule',
      cron: NEVER_FIRES,
      timezone: 'UTC',
    })
    scheduler.reload()
    expect(scheduledNames()).toHaveLength(2)

    updateTrigger(db, second.id, { enabled: false })
    scheduler.reload()
    expect(scheduledNames()).toHaveLength(1)

    deleteTrigger(db, second.id)
    scheduler.reload()
    expect(scheduledNames()).toHaveLength(1)

    scheduler.stop()
    expect(scheduledNames()).toHaveLength(0)
  })
})

/** A graph that waits on an approval with a one-minute timeout, then ends in an output. */
const waitingDefinition = (onTimeout: ApprovalNode['onTimeout']) =>
  AgentDefinition.parse({
    name: 'Timed review',
    nodes: [
      { id: 'trigger', type: 'trigger', label: 'Start', position: { x: 0, y: 0 } },
      {
        id: 'review',
        type: 'approval',
        label: 'Review',
        message: 'Approve?',
        timeoutMinutes: 1,
        onTimeout,
        position: { x: 0, y: 0 },
      },
      { id: 'out', type: 'output', label: 'Done', template: 'done', position: { x: 0, y: 0 } },
    ],
    edges: [
      { id: 'e1', from: 'trigger', to: 'review' },
      { id: 'e2', from: 'review', to: 'out' },
    ],
  })

/** Starts a run, waits for its approval, and backdates the request by two minutes. */
const runWaitingPastTimeout = async (onTimeout: ApprovalNode['onTimeout']) => {
  const { db, deps } = setup()
  const agentId = publishAgent(db, waitingDefinition(onTimeout))
  const run = startRun(deps, { agentId, triggerKind: 'manual', input: 'x' })
  await waitFor(() => getRun(db, run.id).status === 'waiting_approval')
  db.prepare('UPDATE approvals SET requested_at = ? WHERE run_id = ?').run(
    new Date(Date.now() - 2 * 60_000).toISOString(),
    run.id,
  )
  return { db, deps, runId: run.id }
}

describe('approval timeouts', () => {
  it('fails the run with "Approval timed out" when onTimeout is fail', async () => {
    const { db, deps, runId } = await runWaitingPastTimeout('fail')

    expect(expireTimedOut(deps, new Date())).toBe(1)

    expect(getRun(db, runId)).toMatchObject({ status: 'failed', error: 'Approval timed out' })
    expect(listApprovals(db, runId)).toMatchObject([{ status: 'expired' }])
    const kinds = listEvents(db, runId).map((event) => event.kind)
    expect(kinds).toContain('approval_resolved')
    expect(kinds.at(-1)).toBe('run_end')
  })

  it('expires the approval and resumes the run when onTimeout is approve', async () => {
    const { db, deps, runId } = await runWaitingPastTimeout('approve')

    expect(expireTimedOut(deps, new Date())).toBe(1)

    await waitFor(() => getRun(db, runId).status === 'succeeded')
    expect(listApprovals(db, runId)).toMatchObject([{ status: 'expired' }])
    expect(listEvents(db, runId)).toContainEqual(
      expect.objectContaining({
        kind: 'approval_resolved',
        payload: expect.objectContaining({ status: 'expired' }),
      }),
    )
  })

  it('leaves an approval alone until its timeout has passed, and times it out only once', async () => {
    const { db, deps, runId } = await runWaitingPastTimeout('fail')
    db.prepare('UPDATE approvals SET requested_at = ? WHERE run_id = ?').run(
      new Date().toISOString(),
      runId,
    )
    expect(expireTimedOut(deps, new Date())).toBe(0)

    expect(expireTimedOut(deps, new Date(Date.now() + 2 * 60_000))).toBe(1)
    expect(expireTimedOut(deps, new Date(Date.now() + 4 * 60_000))).toBe(0)
  })
})
