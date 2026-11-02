import { Run, RunDetail, RunSummary } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { createAgent } from '../db/agents.ts'
import { migrate, openDb } from '../db/sqlite.ts'
import {
  defaultAgentDefinition,
  fakeLlm,
  publishAgent,
  testEngine,
  textMessage,
} from '../engine/testing.ts'

const setup = () => {
  const db = openDb(':memory:')
  migrate(db)
  const llm = fakeLlm(async () => textMessage('{"reply":"hi"}'))
  const engine = testEngine(db, llm)
  const app = createApp(db, engine)
  const agentId = publishAgent(db, defaultAgentDefinition('Echo'))
  return { db, app, agentId }
}

const json = (method: string, body?: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

/** Polls the run detail until it has ended. */
const untilEnded = async (app: ReturnType<typeof createApp>, runId: string): Promise<RunDetail> => {
  for (let attempt = 0; attempt < 300; attempt++) {
    const detail = RunDetail.parse(await (await app.request(`/api/runs/${runId}`)).json())
    if (['succeeded', 'failed', 'cancelled'].includes(detail.status)) return detail
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('run did not end')
}

describe('runs routes', () => {
  it('starts a run with 201, then the detail has run_start and run_end', async () => {
    const { app, agentId } = setup()

    const started = await app.request(`/api/agents/${agentId}/runs`, json('POST', { input: 'hi' }))
    expect(started.status).toBe(201)
    const run = Run.parse(await started.json())
    expect(run).toMatchObject({
      agentId,
      status: 'queued',
      versionNumber: 1,
      triggerKind: 'manual',
    })

    const detail = await untilEnded(app, run.id)
    expect(detail).toMatchObject({ status: 'succeeded', agentName: 'Echo' })
    const kinds = detail.events.map((event) => event.kind)
    expect(kinds).toContain('run_start')
    expect(kinds.at(-1)).toBe('run_end')

    const listed = (await (await app.request(`/api/agents/${agentId}/runs`)).json()) as unknown[]
    expect(RunSummary.array().parse(listed)).toHaveLength(1)
    const all = (await (await app.request('/api/runs?status=succeeded')).json()) as unknown[]
    expect(RunSummary.array().parse(all)).toHaveLength(1)
  })

  it('refuses to start a run for an agent with no published version', async () => {
    const { db, app } = setup()
    const agent = createAgent(db, { name: 'Draft only', description: '' })

    const res = await app.request(`/api/agents/${agent.id}/runs`, json('POST', { input: 'hi' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid definition' })
  })

  it('streams the stored events and then done, once the run has ended', async () => {
    const { app, agentId } = setup()
    const run = Run.parse(
      await (
        await app.request(`/api/agents/${agentId}/runs`, json('POST', { input: 'hi' }))
      ).json(),
    )
    await untilEnded(app, run.id)

    const res = await app.request(`/api/runs/${run.id}/events`)

    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const body = await res.text()
    expect(body).toContain('event: run_event')
    expect(body).toContain('id: 1\n')
    const doneData = body.split('event: done\ndata: ')[1]
    expect(doneData).toBeDefined()
    expect(Run.parse(JSON.parse(doneData ?? 'null'))).toMatchObject({
      id: run.id,
      status: 'succeeded',
    })
  })

  it('answers 404 for an unknown run', async () => {
    const { app } = setup()
    expect((await app.request('/api/runs/nope')).status).toBe(404)
    expect((await app.request('/api/runs/nope/events')).status).toBe(404)
  })
})
