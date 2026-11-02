import {
  type CreateCaseBody,
  EvalCase,
  EvalCaseResult,
  EvalDataset,
  type EvalResult,
  EvalRun,
  EvalRunDetail,
  type EvalRunStatus,
  type EvalSummary,
  type UpdateCaseBody,
} from '@agentforgeloop/shared'
import { NotFoundError } from '../errors.ts'
import { getAgent } from './agents.ts'
import { all, type Db, get, newId, nowIso, run, transaction } from './sqlite.ts'

type DatasetRow = { id: string; agent_id: string; name: string; created_at: string }
type CaseRow = {
  id: string
  dataset_id: string
  name: string
  input_json: string
  scorers_json: string
  tags_json: string
}
type EvalRunRow = {
  id: string
  agent_id: string
  dataset_id: string
  version_id: string
  version_number: number
  status: string
  summary_json: string | null
  created_at: string
  finished_at: string | null
}
type ResultRow = {
  id: string
  eval_run_id: string
  case_id: string
  run_id: string
  pass: number
  scores_json: string
  cost_usd: number
  latency_ms: number
  case_name: string
}

// JSON columns come back as unknown; the shared zod schemas validate them when mapping.
const toDataset = (row: DatasetRow): EvalDataset =>
  EvalDataset.parse({
    id: row.id,
    agentId: row.agent_id,
    name: row.name,
    createdAt: row.created_at,
  })

const toCase = (row: CaseRow): EvalCase =>
  EvalCase.parse({
    id: row.id,
    datasetId: row.dataset_id,
    name: row.name,
    input: JSON.parse(row.input_json),
    scorers: JSON.parse(row.scorers_json),
    tags: JSON.parse(row.tags_json),
  })

const toEvalRun = (row: EvalRunRow): EvalRun =>
  EvalRun.parse({
    id: row.id,
    agentId: row.agent_id,
    datasetId: row.dataset_id,
    versionId: row.version_id,
    versionNumber: row.version_number,
    status: row.status,
    summary: row.summary_json === null ? null : JSON.parse(row.summary_json),
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  })

const toResult = (row: ResultRow): EvalCaseResult =>
  EvalCaseResult.parse({
    id: row.id,
    evalRunId: row.eval_run_id,
    caseId: row.case_id,
    runId: row.run_id,
    pass: row.pass === 1,
    scores: JSON.parse(row.scores_json),
    costUsd: row.cost_usd,
    latencyMs: row.latency_ms,
    caseName: row.case_name,
  })

// Datasets

export const listDatasets = (db: Db, agentId: string): EvalDataset[] => {
  getAgent(db, agentId)
  return all<DatasetRow>(
    db,
    'SELECT * FROM eval_datasets WHERE agent_id = ? ORDER BY created_at DESC, rowid DESC',
    [agentId],
  ).map(toDataset)
}

export const getDataset = (db: Db, id: string): EvalDataset => {
  const row = get<DatasetRow>(db, 'SELECT * FROM eval_datasets WHERE id = ?', [id])
  if (!row) throw new NotFoundError(`Dataset ${id} not found`)
  return toDataset(row)
}

export const createDataset = (db: Db, agentId: string, name: string): EvalDataset => {
  getAgent(db, agentId)
  const id = newId()
  run(db, 'INSERT INTO eval_datasets (id, agent_id, name, created_at) VALUES (?, ?, ?, ?)', [
    id,
    agentId,
    name,
    nowIso(),
  ])
  return getDataset(db, id)
}

export const deleteDataset = (db: Db, id: string): void => {
  if (run(db, 'DELETE FROM eval_datasets WHERE id = ?', [id]) === 0)
    throw new NotFoundError(`Dataset ${id} not found`)
}

// Cases

export const listCases = (db: Db, datasetId: string): EvalCase[] => {
  getDataset(db, datasetId)
  return all<CaseRow>(db, 'SELECT * FROM eval_cases WHERE dataset_id = ? ORDER BY rowid', [
    datasetId,
  ]).map(toCase)
}

export const getCase = (db: Db, id: string): EvalCase => {
  const row = get<CaseRow>(db, 'SELECT * FROM eval_cases WHERE id = ?', [id])
  if (!row) throw new NotFoundError(`Case ${id} not found`)
  return toCase(row)
}

export const createCase = (db: Db, datasetId: string, body: CreateCaseBody): EvalCase => {
  getDataset(db, datasetId)
  const id = newId()
  run(
    db,
    'INSERT INTO eval_cases (id, dataset_id, name, input_json, scorers_json, tags_json) VALUES (?, ?, ?, ?, ?, ?)',
    [
      id,
      datasetId,
      body.name,
      JSON.stringify(body.input ?? null),
      JSON.stringify(body.scorers),
      JSON.stringify(body.tags),
    ],
  )
  return getCase(db, id)
}

/** Only the fields that are given change. */
export const updateCase = (db: Db, id: string, patch: UpdateCaseBody): EvalCase => {
  const current = getCase(db, id)
  run(
    db,
    'UPDATE eval_cases SET name = ?, input_json = ?, scorers_json = ?, tags_json = ? WHERE id = ?',
    [
      patch.name ?? current.name,
      JSON.stringify(patch.input === undefined ? current.input : patch.input),
      JSON.stringify(patch.scorers ?? current.scorers),
      JSON.stringify(patch.tags ?? current.tags),
      id,
    ],
  )
  return getCase(db, id)
}

export const deleteCase = (db: Db, id: string): void => {
  if (run(db, 'DELETE FROM eval_cases WHERE id = ?', [id]) === 0)
    throw new NotFoundError(`Case ${id} not found`)
}

// Eval runs

export type NewEvalRun = {
  agentId: string
  datasetId: string
  versionId: string
  versionNumber: number
}

export const insertEvalRun = (db: Db, input: NewEvalRun): EvalRun => {
  const id = newId()
  run(
    db,
    "INSERT INTO eval_runs (id, agent_id, dataset_id, version_id, version_number, status, summary_json, created_at, finished_at) VALUES (?, ?, ?, ?, ?, 'queued', NULL, ?, NULL)",
    [id, input.agentId, input.datasetId, input.versionId, input.versionNumber, nowIso()],
  )
  return getEvalRun(db, id)
}

export const getEvalRun = (db: Db, id: string): EvalRun => {
  const row = get<EvalRunRow>(db, 'SELECT * FROM eval_runs WHERE id = ?', [id])
  if (!row) throw new NotFoundError(`Eval run ${id} not found`)
  return toEvalRun(row)
}

export const listEvalRuns = (db: Db, agentId: string): EvalRun[] => {
  getAgent(db, agentId)
  return all<EvalRunRow>(
    db,
    'SELECT * FROM eval_runs WHERE agent_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 50',
    [agentId],
  ).map(toEvalRun)
}

/** Status always changes; a summary and finish time are written only when given. */
export const updateEvalRun = (
  db: Db,
  id: string,
  patch: { status: EvalRunStatus; summary?: EvalSummary; finishedAt?: string },
): void => {
  run(
    db,
    'UPDATE eval_runs SET status = ?, summary_json = COALESCE(?, summary_json), finished_at = COALESCE(?, finished_at) WHERE id = ?',
    [
      patch.status,
      patch.summary === undefined ? null : JSON.stringify(patch.summary),
      patch.finishedAt ?? null,
      id,
    ],
  )
}

/** Eval runs left queued or running by a restart can never finish; mark them failed at boot. */
export const failInterruptedEvalRuns = (db: Db): void => {
  run(
    db,
    "UPDATE eval_runs SET status = 'failed', finished_at = ? WHERE status IN ('queued', 'running')",
    [nowIso()],
  )
}

export const insertResults = (db: Db, results: EvalResult[]): void =>
  transaction(db, () => {
    for (const result of results) {
      run(
        db,
        'INSERT INTO eval_results (id, eval_run_id, case_id, run_id, pass, scores_json, cost_usd, latency_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          result.id,
          result.evalRunId,
          result.caseId,
          result.runId,
          result.pass ? 1 : 0,
          JSON.stringify(result.scores),
          result.costUsd,
          result.latencyMs,
        ],
      )
    }
  })

export const listResults = (db: Db, evalRunId: string): EvalCaseResult[] =>
  all<ResultRow>(
    db,
    'SELECT r.*, c.name AS case_name FROM eval_results r JOIN eval_cases c ON c.id = r.case_id WHERE r.eval_run_id = ? ORDER BY c.rowid',
    [evalRunId],
  ).map(toResult)

export const getEvalRunDetail = (db: Db, id: string): EvalRunDetail => {
  const evalRun = getEvalRun(db, id)
  return EvalRunDetail.parse({
    ...evalRun,
    datasetName: getDataset(db, evalRun.datasetId).name,
    results: listResults(db, id),
  })
}
