import {
  CreateCaseBody,
  CreateDatasetBody,
  StartEvalRunBody,
  UpdateCaseBody,
} from '@agentforgeloop/shared'
import { Hono } from 'hono'
import {
  createCase,
  createDataset,
  deleteCase,
  deleteDataset,
  getEvalRunDetail,
  listCases,
  listDatasets,
  listEvalRuns,
  updateCase,
} from '../db/evals.ts'
import type { Db } from '../db/sqlite.ts'
import type { EngineDeps } from '../engine/types.ts'
import { startEvalRun } from '../evals/runner.ts'
import { readJson } from './read-json.ts'

/** Mounted at /api, so paths carry the full suffix, e.g. '/agents/:id/evals/datasets'. */
export const evalRoutes = (db: Db, deps: EngineDeps) => {
  const api = new Hono()

  api.get('/agents/:id/evals/datasets', (c) => c.json(listDatasets(db, c.req.param('id'))))

  api.post('/agents/:id/evals/datasets', async (c) => {
    const body = CreateDatasetBody.parse(await readJson(c))
    return c.json(createDataset(db, c.req.param('id'), body.name), 201)
  })

  api.delete('/evals/datasets/:id', (c) => {
    deleteDataset(db, c.req.param('id'))
    return c.body(null, 204)
  })

  api.get('/evals/datasets/:id/cases', (c) => c.json(listCases(db, c.req.param('id'))))

  api.post('/evals/datasets/:id/cases', async (c) => {
    const body = CreateCaseBody.parse(await readJson(c))
    return c.json(createCase(db, c.req.param('id'), body), 201)
  })

  api.patch('/evals/cases/:id', async (c) => {
    const body = UpdateCaseBody.parse(await readJson(c))
    return c.json(updateCase(db, c.req.param('id'), body))
  })

  api.delete('/evals/cases/:id', (c) => {
    deleteCase(db, c.req.param('id'))
    return c.body(null, 204)
  })

  api.get('/agents/:id/evals/runs', (c) => c.json(listEvalRuns(db, c.req.param('id'))))

  api.post('/agents/:id/evals/runs', async (c) => {
    const body = StartEvalRunBody.parse(await readJson(c))
    const evalRun = startEvalRun(deps, {
      agentId: c.req.param('id'),
      datasetId: body.datasetId,
      versionNumber: body.versionNumber,
    })
    return c.json(evalRun, 202)
  })

  api.get('/evals/runs/:id', (c) => c.json(getEvalRunDetail(db, c.req.param('id'))))

  return api
}
