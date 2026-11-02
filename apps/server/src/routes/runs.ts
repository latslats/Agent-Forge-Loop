import { RunListQuery, StartRunBody } from '@agentforgeloop/shared'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { getRun, getRunDetail, listAgentRuns, listRuns } from '../db/runs.ts'
import { cancelRun, startRun } from '../engine/executor.ts'
import type { EngineDeps } from '../engine/types.ts'
import { readJson } from './read-json.ts'
import { streamRunEvents } from './run-stream.ts'

export const runRoutes = (deps: EngineDeps) => {
  const { db } = deps
  const api = new Hono()

  api.get('/runs', (c) => c.json(listRuns(db, RunListQuery.parse(c.req.query()))))

  api.get('/agents/:id/runs', (c) => c.json(listAgentRuns(db, c.req.param('id'))))

  api.post('/agents/:id/runs', async (c) => {
    const body = StartRunBody.parse(await readJson(c))
    const run = startRun(deps, {
      agentId: c.req.param('id'),
      versionNumber: body.versionNumber,
      triggerKind: 'manual',
      input: body.input,
    })
    return c.json(run, 201)
  })

  api.get('/runs/:id', (c) => c.json(getRunDetail(db, c.req.param('id'))))

  api.post('/runs/:id/cancel', (c) => c.json(cancelRun(deps, c.req.param('id'))))

  api.get('/runs/:id/events', (c) => {
    const runId = c.req.param('id')
    getRun(db, runId) // unknown run: 404 before the stream starts
    return streamSSE(c, (stream) => streamRunEvents(deps, runId, stream))
  })

  return api
}
