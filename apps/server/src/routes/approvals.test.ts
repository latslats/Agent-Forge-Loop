import { AgentDefinition, PendingApproval, Run, RunDetail } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { listAgents } from '../db/agents.ts'
import { type Db, migrate, openDb } from '../db/sqlite.ts'
import { fakeLlm, publishAgent, testEngine, textMessage } from '../engine/testing.ts'
import { seedExample } from '../seed.ts'

type App = ReturnType<typeof createApp>

const CLEAN_REPLY = { category: 'billing', reply: 'Your refund is on its way.' }

/** The seeded support graph, with an AI step that answers with `reply`. */
const setupSupport = (reply: unknown) => {
  const db: Db = openDb(':memory:')
  migrate(db)
  seedExample(db)
  const agentId = listAgents(db)[0]?.id ?? ''
  const llm = fakeLlm(async () => textMessage(JSON.stringify(reply)))
  const app: App = createApp(db, testEngine(db, llm))
  return { db, app, agentId }
}

const json = (method: string, body?: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

const startRun = async (
  app: App,
  agentId: string,
  input = 'Where is my refund?',
): Promise<string> =>
  Run.parse(
    await (await app.request(`/api/agents/${agentId}/runs`, json('POST', { input }))).json(),
  ).id

/** Polls the run until its status is one of `statuses`. */
const untilStatus = async (app: App, runId: string, statuses: string[]): Promise<RunDetail> => {
  for (let attempt = 0; attempt < 300; attempt++) {
    const detail = RunDetail.parse(await (await app.request(`/api/runs/${runId}`)).json())
    if (statuses.includes(detail.status)) return detail
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`run did not reach ${statuses.join(' or ')}`)
}

describe('support email triage graph', () => {
  it('routes an email with a card number to the blocked output, with a failed check_result', async () => {
    const { app, agentId } = setupSupport(CLEAN_REPLY)
    const card = 'My card 4111 1111 1111 1111 was charged twice. Where is my refund?'

    const detail = await untilStatus(app, await startRun(app, agentId, card), [
      'succeeded',
      'failed',
    ])

    expect(detail.status).toBe('succeeded')
    expect(detail.output).toEqual(CLEAN_REPLY)
    expect(detail.approvals).toEqual([])
    const check = detail.events.find((event) => event.kind === 'check_result')
    expect(check?.payload).toMatchObject({ kind: 'regex', pass: false })
  })

  it('waits for approval on a clean reply, then approve finishes the run with the reply', async () => {
    const { app, agentId } = setupSupport(CLEAN_REPLY)
    const runId = await startRun(app, agentId)

    const waiting = await untilStatus(app, runId, ['waiting_approval', 'failed'])
    expect(waiting.status).toBe('waiting_approval')
    expect(waiting.approvals).toMatchObject([{ status: 'pending', nodeId: 'review' }])
    const requested = waiting.events.find((event) => event.kind === 'approval_requested')
    expect(requested?.payload).toMatchObject({ message: 'Approve the drafted reply?' })

    const approvalId = waiting.approvals[0]?.id ?? ''
    const res = await app.request(
      `/api/runs/${runId}/approvals/${approvalId}/approve`,
      json('POST', { note: 'looks good' }),
    )
    expect(res.status).toBe(200)
    expect(RunDetail.parse(await res.json()).status).toBe('running')

    const done = await untilStatus(app, runId, ['succeeded', 'failed'])
    expect(done.status).toBe('succeeded')
    expect(done.output).toBe(CLEAN_REPLY.reply)
    expect(done.approvals[0]).toMatchObject({ status: 'approved', note: 'looks good' })
    expect(done.events.map((event) => event.kind)).toContain('approval_resolved')
  })

  it('reject fails the run with "Rejected by reviewer"', async () => {
    const { app, agentId } = setupSupport(CLEAN_REPLY)
    const runId = await startRun(app, agentId)
    const waiting = await untilStatus(app, runId, ['waiting_approval'])
    const approvalId = waiting.approvals[0]?.id ?? ''

    const res = await app.request(
      `/api/runs/${runId}/approvals/${approvalId}/reject`,
      json('POST', {}),
    )

    expect(res.status).toBe(200)
    const detail = RunDetail.parse(await res.json())
    expect(detail).toMatchObject({ status: 'failed', error: 'Rejected by reviewer' })
    expect(detail.events.at(-1)).toMatchObject({
      kind: 'run_end',
      payload: { status: 'failed' },
    })
  })

  it('reject with a note adds the note to the error', async () => {
    const { app, agentId } = setupSupport(CLEAN_REPLY)
    const runId = await startRun(app, agentId)
    const approvalId = (await untilStatus(app, runId, ['waiting_approval'])).approvals[0]?.id ?? ''

    const res = await app.request(
      `/api/runs/${runId}/approvals/${approvalId}/reject`,
      json('POST', { note: 'tone is wrong' }),
    )

    expect(RunDetail.parse(await res.json())).toMatchObject({
      status: 'failed',
      error: 'Rejected by reviewer: tone is wrong',
    })
  })

  it('answers 409 when an approval is decided twice', async () => {
    const { app, agentId } = setupSupport(CLEAN_REPLY)
    const runId = await startRun(app, agentId)
    const approvalId = (await untilStatus(app, runId, ['waiting_approval'])).approvals[0]?.id ?? ''
    const path = `/api/runs/${runId}/approvals/${approvalId}`

    expect((await app.request(`${path}/approve`, json('POST', {}))).status).toBe(200)

    const again = await app.request(`${path}/approve`, json('POST', {}))
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({ error: 'approval already decided' })
    const rejected = await app.request(`${path}/reject`, json('POST', {}))
    expect(rejected.status).toBe(409)
  })

  it('answers 404 for an unknown approval, or one that belongs to another run', async () => {
    const { app, agentId } = setupSupport(CLEAN_REPLY)
    const runId = await startRun(app, agentId)
    const approvalId = (await untilStatus(app, runId, ['waiting_approval'])).approvals[0]?.id ?? ''

    expect(
      (await app.request(`/api/runs/${runId}/approvals/nope/approve`, json('POST', {}))).status,
    ).toBe(404)
    expect(
      (await app.request(`/api/runs/other/approvals/${approvalId}/approve`, json('POST', {})))
        .status,
    ).toBe(404)
  })

  it('lists the pending approval with its agent name and message, then drops it once decided', async () => {
    const { app, agentId } = setupSupport(CLEAN_REPLY)
    const runId = await startRun(app, agentId)
    const approvalId = (await untilStatus(app, runId, ['waiting_approval'])).approvals[0]?.id ?? ''

    const pending = PendingApproval.array().parse(
      await (await app.request('/api/approvals')).json(),
    )
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      id: approvalId,
      runId,
      agentId,
      agentName: 'Support email triage',
      message: 'Approve the drafted reply?',
      status: 'pending',
    })

    await app.request(`/api/runs/${runId}/approvals/${approvalId}/reject`, json('POST', {}))
    expect(await (await app.request('/api/approvals')).json()).toEqual([])
  })

  it('cancelling a waiting run expires its approval, so the queue drops it', async () => {
    const { app, agentId } = setupSupport(CLEAN_REPLY)
    const runId = await startRun(app, agentId)
    const approvalId = (await untilStatus(app, runId, ['waiting_approval'])).approvals[0]?.id ?? ''

    expect((await app.request(`/api/runs/${runId}/cancel`, json('POST'))).status).toBe(200)

    const detail = RunDetail.parse(await (await app.request(`/api/runs/${runId}`)).json())
    expect(detail).toMatchObject({ status: 'cancelled', approvals: [{ status: 'expired' }] })
    expect(await (await app.request('/api/approvals')).json()).toEqual([])
    const late = await app.request(
      `/api/runs/${runId}/approvals/${approvalId}/approve`,
      json('POST', {}),
    )
    expect(late.status).toBe(409)
  })
})

describe('approval message', () => {
  it('renders {{ }} placeholders in the queued message, as the approval event does', async () => {
    const db: Db = openDb(':memory:')
    migrate(db)
    const app: App = createApp(
      db,
      testEngine(
        db,
        fakeLlm(async () => textMessage('')),
      ),
    )
    const position = { x: 0, y: 0 }
    const agentId = publishAgent(
      db,
      AgentDefinition.parse({
        name: 'Reply review',
        nodes: [
          { id: 'trigger', type: 'trigger', label: 'Start', position },
          {
            id: 'draft',
            type: 'code',
            label: 'Draft',
            source: "return { reply: 'Hi ' + input };",
            position,
          },
          {
            id: 'review',
            type: 'approval',
            label: 'Review',
            message: 'Approve: {{prev.reply}}',
            position,
          },
          { id: 'send', type: 'output', label: 'Send', template: '{{prev.reply}}', position },
        ],
        edges: [
          { id: 'e1', from: 'trigger', to: 'draft' },
          { id: 'e2', from: 'draft', to: 'review' },
          { id: 'e3', from: 'review', to: 'send' },
        ],
      }),
    )

    const waiting = await untilStatus(app, await startRun(app, agentId), ['waiting_approval'])
    const requested = waiting.events.find((event) => event.kind === 'approval_requested')
    const pending = PendingApproval.array().parse(
      await (await app.request('/api/approvals')).json(),
    )

    expect(pending[0]?.message).toBe('Approve: Hi Where is my refund?')
    expect(pending[0]?.message).toBe(requested?.payload.message)
  })
})

describe('check step with onFail stop', () => {
  it('fails the run with the check label and reason', async () => {
    const db: Db = openDb(':memory:')
    migrate(db)
    const llm = fakeLlm(async () => textMessage('no reference in this answer'))
    const app: App = createApp(db, testEngine(db, llm))
    const position = { x: 0, y: 0 }
    const definition = AgentDefinition.parse({
      name: 'Strict',
      nodes: [
        { id: 'trigger', type: 'trigger', label: 'Start', position },
        { id: 'answer', type: 'ai', label: 'Answer', prompt: '', tools: [], maxTurns: 8, position },
        {
          id: 'ref',
          type: 'check',
          label: 'Needs reference',
          check: {
            kind: 'regex',
            pattern: 'REF-\\d+',
            flags: '',
            mode: 'require',
            target: 'output',
          },
          onFail: 'stop',
          position,
        },
        { id: 'out', type: 'output', label: 'Done', template: '', position },
      ],
      edges: [
        { id: 'e1', from: 'trigger', to: 'answer' },
        { id: 'e2', from: 'answer', to: 'ref' },
        { id: 'e3', from: 'ref', to: 'out', label: 'pass' },
      ],
    })
    const agentId = publishAgent(db, definition)

    const detail = await untilStatus(app, await startRun(app, agentId), ['succeeded', 'failed'])

    expect(detail.status).toBe('failed')
    expect(detail.error).toBe('Check "Needs reference" failed: No match for /REF-\\d+/')
  })
})
