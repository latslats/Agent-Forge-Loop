import { AgentDefinition, type EvalResult } from '@agentforgeloop/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCase, createDataset, getEvalRun, getEvalRunDetail } from '../db/evals.ts'
import { listRuns } from '../db/runs.ts'
import { type Db, migrate, openDb } from '../db/sqlite.ts'
import { fakeLlm, publishAgent, testEngine, textMessage, waitFor } from '../engine/testing.ts'
import { ConflictError, NotFoundError } from '../errors.ts'
import { startEvalRun, summarize } from './runner.ts'

const pos = { x: 0, y: 0 }

// Code only, no model: doubles the input's n.
const doublerDefinition = AgentDefinition.parse({
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

const result = (overrides: Partial<EvalResult>): EvalResult => ({
  id: 'r',
  evalRunId: 'e',
  caseId: 'c',
  runId: 'run',
  pass: true,
  scores: [],
  costUsd: 0,
  latencyMs: 0,
  ...overrides,
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

describe('summarize', () => {
  it('computes pass rate, mean cost and nearest-rank p50 latency', () => {
    const summary = summarize([
      result({ pass: true, costUsd: 0.1, latencyMs: 300 }),
      result({ pass: false, costUsd: 0.3, latencyMs: 100 }),
      result({ pass: true, costUsd: 0.2, latencyMs: 200 }),
    ])
    expect(summary).toMatchObject({ total: 3, passed: 2, p50LatencyMs: 200 })
    expect(summary.passRate).toBeCloseTo(2 / 3)
    expect(summary.meanCostUsd).toBeCloseTo(0.2)
  })

  it('returns zeros for no results', () => {
    expect(summarize([])).toEqual({
      total: 0,
      passed: 0,
      passRate: 0,
      meanCostUsd: 0,
      p50LatencyMs: 0,
    })
  })
})

describe('startEvalRun', () => {
  it('runs three cases on a code-only agent, stores three results and a summary', async () => {
    const agentId = publishAgent(db, doublerDefinition)
    const dataset = createDataset(db, agentId, 'Doubling')
    const scorers = [{ kind: 'exact' as const, expected: '2' }]
    createCase(db, dataset.id, { name: 'one', input: { n: 1 }, scorers, tags: [] })
    createCase(db, dataset.id, {
      name: 'two',
      input: { n: 2 },
      scorers: [{ kind: 'exact', expected: '4' }],
      tags: [],
    })
    createCase(db, dataset.id, {
      name: 'three',
      input: { n: 3 },
      scorers: [{ kind: 'exact', expected: '7' }],
      tags: [],
    })
    const deps = testEngine(
      db,
      fakeLlm(async () => textMessage('')),
    )

    const started = startEvalRun(deps, { agentId, datasetId: dataset.id })
    expect(started).toMatchObject({ status: 'queued', versionNumber: 1 })
    await waitFor(() => ['succeeded', 'failed'].includes(getEvalRun(db, started.id).status), 5000)

    const detail = getEvalRunDetail(db, started.id)
    expect(detail).toMatchObject({ status: 'succeeded', datasetName: 'Doubling' })
    expect(detail.results).toHaveLength(3)
    expect(detail.results.map((item) => [item.caseName, item.pass])).toEqual([
      ['one', true],
      ['two', true],
      ['three', false],
    ])
    expect(detail.results[2]?.scores[0]).toMatchObject({ kind: 'exact', pass: false })
    expect(detail.summary).toMatchObject({ total: 3, passed: 2, passRate: 2 / 3 })
    expect(listRuns(db, { agentId, limit: 50 }).map((item) => item.triggerKind)).toEqual([
      'eval',
      'eval',
      'eval',
    ])
  })

  it('refuses a dataset with no cases, and a dataset that belongs to another agent', () => {
    const agentId = publishAgent(db, doublerDefinition)
    const otherId = publishAgent(db, doublerDefinition)
    const empty = createDataset(db, agentId, 'Empty')
    const deps = testEngine(
      db,
      fakeLlm(async () => textMessage('')),
    )

    expect(() => startEvalRun(deps, { agentId, datasetId: empty.id })).toThrow(ConflictError)
    expect(() => startEvalRun(deps, { agentId: otherId, datasetId: empty.id })).toThrow(
      NotFoundError,
    )
  })
})
