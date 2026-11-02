import { AgentDefinition, type RunStatus } from '@agentforgeloop/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listApprovals } from '../../db/approvals.ts'
import { getRun, listEvents } from '../../db/runs.ts'
import { type Db, migrate, openDb } from '../../db/sqlite.ts'
import { startRun } from '../executor.ts'
import { fakeLlm, publishAgent, testEngine, textMessage, waitFor } from '../testing.ts'

const TERMINAL: RunStatus[] = ['succeeded', 'failed', 'cancelled']
const pos = { x: 0, y: 0 }

// trigger -> code (sets prev) -> approval -> output (renders prev)
const approvalDefinition = AgentDefinition.parse({
  name: 'Reviewed',
  nodes: [
    { id: 'trigger', type: 'trigger', label: 'Trigger', position: pos },
    { id: 'code', type: 'code', label: 'Code', source: 'return { ok: 1 }', position: pos },
    { id: 'review', type: 'approval', label: 'Review', message: 'Approve?', position: pos },
    { id: 'out', type: 'output', label: 'Out', template: '{{prev.ok}}', position: pos },
  ],
  edges: [
    { id: 'e1', from: 'trigger', to: 'code' },
    { id: 'e2', from: 'code', to: 'review' },
    { id: 'e3', from: 'review', to: 'out' },
  ],
})

let db: Db
beforeEach(() => {
  db = openDb(':memory:')
  migrate(db)
})
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20))
  db.close()
})

describe('approval node', () => {
  it('auto-passes in an eval run, logs it, and continues to the output', async () => {
    const agentId = publishAgent(db, approvalDefinition)
    const started = startRun(
      testEngine(
        db,
        fakeLlm(async () => textMessage('')),
      ),
      {
        agentId,
        triggerKind: 'eval',
        input: {},
      },
    )
    await waitFor(() => TERMINAL.includes(getRun(db, started.id).status))

    const finished = getRun(db, started.id)
    expect(finished).toMatchObject({ status: 'succeeded', output: '1' })
    expect(listApprovals(db, started.id)).toEqual([])
    expect(
      listEvents(db, started.id).some(
        (event) =>
          event.kind === 'log' && event.payload.message === 'Approval auto-passed in eval run',
      ),
    ).toBe(true)
  })

  it('still waits for a person in a manual run', async () => {
    const agentId = publishAgent(db, approvalDefinition)
    const started = startRun(
      testEngine(
        db,
        fakeLlm(async () => textMessage('')),
      ),
      {
        agentId,
        triggerKind: 'manual',
        input: {},
      },
    )
    await waitFor(() => getRun(db, started.id).status === 'waiting_approval')

    expect(listApprovals(db, started.id)).toMatchObject([{ status: 'pending', nodeId: 'review' }])
  })
})
