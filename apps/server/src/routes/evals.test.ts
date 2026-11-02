import {
  AgentDefinition,
  EvalCase,
  EvalDataset,
  EvalRun,
  EvalRunDetail,
} from '@agentforgeloop/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { type Db, migrate, openDb } from '../db/sqlite.ts'
import { fakeLlm, publishAgent, testEngine, textMessage } from '../engine/testing.ts'

type App = ReturnType<typeof createApp>

const pos = { x: 0, y: 0 }
const doubler = AgentDefinition.parse({
  name: 'Doubler',
  nodes: [
    { id: 'trigger', type: 'trigger', label: 'Trigger', position: pos },
    {
      id: 'code',
      type: 'code',
      label: 'Code',
      source: 'return { doubled: input.n * 2 }',
      position: pos,
    },
    { id: 'out', type: 'output', label: 'Out', template: '{{prev.doubled}}', position: pos },
  ],
  edges: [
    { id: 'e1', from: 'trigger', to: 'code' },
    { id: 'e2', from: 'code', to: 'out' },
  ],
})

let db: Db
let app: App
let agentId: string
beforeEach(() => {
  db = openDb(':memory:')
  migrate(db)
  agentId = publishAgent(db, doubler)
  app = createApp(
    db,
    testEngine(
      db,
      fakeLlm(async () => textMessage('')),
    ),
  )
})
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20))
  db.close()
})

const json = (method: string, body?: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

const caseBody = (name: string, n: number, expected: string) => ({
  name,
  input: { n },
  scorers: [{ kind: 'exact', expected }],
})

const createDataset = async (name = 'Smoke'): Promise<string> =>
  EvalDataset.parse(
    await (
      await app.request(`/api/agents/${agentId}/evals/datasets`, json('POST', { name }))
    ).json(),
  ).id

describe('eval datasets and cases', () => {
  it('creates, lists and deletes datasets', async () => {
    const id = await createDataset()
    const list = await app.request(`/api/agents/${agentId}/evals/datasets`)
    expect(list.status).toBe(200)
    expect(EvalDataset.array().parse(await list.json())).toMatchObject([{ id, name: 'Smoke' }])

    expect((await app.request(`/api/evals/datasets/${id}`, json('DELETE'))).status).toBe(204)
    expect(await (await app.request(`/api/agents/${agentId}/evals/datasets`)).json()).toEqual([])
  })

  it('creates, updates and deletes cases, keeping untouched fields on update', async () => {
    const datasetId = await createDataset()
    const created = await app.request(
      `/api/evals/datasets/${datasetId}/cases`,
      json('POST', caseBody('double two', 2, '4')),
    )
    expect(created.status).toBe(201)
    const caseId = EvalCase.parse(await created.json()).id

    const renamed = await app.request(
      `/api/evals/cases/${caseId}`,
      json('PATCH', { name: 'Renamed' }),
    )
    expect(renamed.status).toBe(200)
    expect(EvalCase.parse(await renamed.json())).toMatchObject({
      name: 'Renamed',
      input: { n: 2 },
      scorers: [{ kind: 'exact', expected: '4' }],
    })

    const listed = await app.request(`/api/evals/datasets/${datasetId}/cases`)
    expect(EvalCase.array().parse(await listed.json())).toHaveLength(1)

    expect((await app.request(`/api/evals/cases/${caseId}`, json('DELETE'))).status).toBe(204)
    expect(await (await app.request(`/api/evals/datasets/${datasetId}/cases`)).json()).toEqual([])
  })

  it('answers 404 for unknown ids', async () => {
    expect((await app.request('/api/agents/nope/evals/datasets')).status).toBe(404)
    expect((await app.request('/api/evals/datasets/nope/cases')).status).toBe(404)
    expect(
      (await app.request('/api/evals/datasets/nope/cases', json('POST', caseBody('x', 1, '2'))))
        .status,
    ).toBe(404)
    expect((await app.request('/api/evals/cases/nope', json('PATCH', { name: 'x' }))).status).toBe(
      404,
    )
    expect((await app.request('/api/evals/datasets/nope', json('DELETE'))).status).toBe(404)
    expect((await app.request('/api/evals/runs/nope')).status).toBe(404)
  })

  it('answers 400 for a body that fails validation', async () => {
    const datasetId = await createDataset()
    expect(
      (await app.request(`/api/agents/${agentId}/evals/datasets`, json('POST', { name: '' })))
        .status,
    ).toBe(400)
    const noScorers = { name: 'x', input: 1, scorers: [] }
    expect(
      (await app.request(`/api/evals/datasets/${datasetId}/cases`, json('POST', noScorers))).status,
    ).toBe(400)
  })
})

describe('eval runs', () => {
  it('starts a run with 202, then serves its detail with one result per case', async () => {
    const datasetId = await createDataset()
    for (const [name, n, expected] of [
      ['one', 1, '2'],
      ['two', 2, '4'],
      ['three', 3, '6'],
    ] as const) {
      await app.request(
        `/api/evals/datasets/${datasetId}/cases`,
        json('POST', caseBody(name, n, expected)),
      )
    }

    const started = await app.request(
      `/api/agents/${agentId}/evals/runs`,
      json('POST', { datasetId }),
    )
    expect(started.status).toBe(202)
    const evalRunId = EvalRun.parse(await started.json()).id

    let detail = EvalRunDetail.parse(
      await (await app.request(`/api/evals/runs/${evalRunId}`)).json(),
    )
    for (let attempt = 0; attempt < 300 && detail.status !== 'succeeded'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      detail = EvalRunDetail.parse(await (await app.request(`/api/evals/runs/${evalRunId}`)).json())
    }
    expect(detail).toMatchObject({ status: 'succeeded', datasetName: 'Smoke' })
    expect(detail.results).toHaveLength(3)
    expect(detail.summary).toMatchObject({ total: 3, passed: 3, passRate: 1 })

    const listed = EvalRun.array().parse(
      await (await app.request(`/api/agents/${agentId}/evals/runs`)).json(),
    )
    expect(listed.map((item) => item.id)).toEqual([evalRunId])
  })

  it('answers 409 for a dataset with no cases', async () => {
    const datasetId = await createDataset()
    const response = await app.request(
      `/api/agents/${agentId}/evals/runs`,
      json('POST', { datasetId }),
    )
    expect(response.status).toBe(409)
  })
})
