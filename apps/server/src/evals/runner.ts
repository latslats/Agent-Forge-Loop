import type {
  EvalCase,
  EvalResult,
  EvalRun,
  EvalSummary,
  Run,
  RunStatus,
  ScoreResult,
  Scorer,
} from '@agentforgeloop/shared'
import { getDataset, insertEvalRun, insertResults, listCases, updateEvalRun } from '../db/evals.ts'
import { getRun, listEvents, resolveVersion } from '../db/runs.ts'
import { newId, nowIso } from '../db/sqlite.ts'
import { cancelRun, startRun } from '../engine/executor.ts'
import type { EngineDeps } from '../engine/types.ts'
import { ConflictError, NotFoundError } from '../errors.ts'
import { runLatencyMs, type ScoreContext, score } from './scorers.ts'

const CASE_CONCURRENCY = 3
const POLL_MS = 300
const GIVE_UP_MS = 5 * 60_000
const TERMINAL: readonly RunStatus[] = ['succeeded', 'failed', 'cancelled']

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Maps `items` with at most `limit` calls in flight. Results keep the order of `items`. */
const mapWithLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = []
  const entries = items.entries()
  const worker = async (): Promise<void> => {
    for (const [index, item] of entries) results[index] = await fn(item)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** Nearest-rank p50 on the sorted latencies. */
export const summarize = (results: EvalResult[]): EvalSummary => {
  const total = results.length
  const passed = results.filter((result) => result.pass).length
  const costSum = results.reduce((sum, result) => sum + result.costUsd, 0)
  const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b)
  return {
    total,
    passed,
    passRate: total === 0 ? 0 : passed / total,
    meanCostUsd: total === 0 ? 0 : costSum / total,
    p50LatencyMs: latencies[Math.ceil(total / 2) - 1] ?? 0,
  }
}

const scoreOrFail = async (scorer: Scorer, ctx: ScoreContext): Promise<ScoreResult> => {
  try {
    return await score(scorer, ctx)
  } catch (err) {
    // A scorer that cannot run (for example the judge without an API key) fails its case.
    const reason = err instanceof Error ? err.message : String(err)
    return { kind: scorer.kind, pass: false, reason }
  }
}

/** Polls until the run is terminal. Past the time limit the run is cancelled and marked timed out. */
const awaitRun = async (
  deps: EngineDeps,
  runId: string,
): Promise<{ run: Run; timedOut: boolean }> => {
  const deadline = Date.now() + GIVE_UP_MS
  for (;;) {
    const current = getRun(deps.db, runId)
    if (TERMINAL.includes(current.status)) return { run: current, timedOut: false }
    if (Date.now() >= deadline) return { run: cancelRun(deps, runId), timedOut: true }
    await sleep(POLL_MS)
  }
}

const runFailureReason = (run: Run, timedOut: boolean): string => {
  if (timedOut) return 'The run did not finish within 5 minutes'
  return run.error ?? `The run ended ${run.status}`
}

/** Runs one case through the engine and scores it. A run that did not succeed never passes. */
const evaluateCase = async (
  deps: EngineDeps,
  evalRun: EvalRun,
  evalCase: EvalCase,
): Promise<EvalResult> => {
  const started = startRun(deps, {
    agentId: evalRun.agentId,
    versionNumber: evalRun.versionNumber,
    triggerKind: 'eval',
    input: evalCase.input,
  })
  const { run, timedOut } = await awaitRun(deps, started.id)
  const events = listEvents(deps.db, run.id)

  const scores: ScoreResult[] = []
  if (run.status !== 'succeeded')
    scores.push({ kind: 'run', pass: false, reason: runFailureReason(run, timedOut) })
  for (const scorer of evalCase.scorers) {
    scores.push(await scoreOrFail(scorer, { output: run.output, run, events, llm: deps.llm }))
  }

  return {
    id: newId(),
    evalRunId: evalRun.id,
    caseId: evalCase.id,
    runId: run.id,
    pass: scores.every((scoreResult) => scoreResult.pass),
    scores,
    costUsd: run.costUsd,
    latencyMs: runLatencyMs(run),
  }
}

/** Runs every case, stores the results, then marks the eval run succeeded or failed. */
const execute = async (deps: EngineDeps, evalRun: EvalRun, cases: EvalCase[]): Promise<void> => {
  const { db } = deps
  try {
    updateEvalRun(db, evalRun.id, { status: 'running' })
    const results = await mapWithLimit(cases, CASE_CONCURRENCY, (evalCase) =>
      evaluateCase(deps, evalRun, evalCase),
    )
    insertResults(db, results)
    updateEvalRun(db, evalRun.id, {
      status: 'succeeded',
      summary: summarize(results),
      finishedAt: nowIso(),
    })
  } catch (err) {
    console.error(err)
    updateEvalRun(db, evalRun.id, { status: 'failed', finishedAt: nowIso() })
  }
}

/**
 * Creates an eval run as queued and starts it in the background. Returns before any case runs.
 * Each case is a normal run with triggerKind 'eval'. Throws NotFoundError for a dataset that is
 * not this agent's, and ConflictError for a dataset with no cases.
 */
export const startEvalRun = (
  deps: EngineDeps,
  request: { agentId: string; datasetId: string; versionNumber?: number },
): EvalRun => {
  const { db } = deps
  const dataset = getDataset(db, request.datasetId)
  if (dataset.agentId !== request.agentId)
    throw new NotFoundError(`Dataset ${request.datasetId} not found`)
  const cases = listCases(db, request.datasetId)
  if (cases.length === 0) throw new ConflictError('Add a case to the dataset before running it')

  const version = resolveVersion(db, request.agentId, request.versionNumber)
  const evalRun = insertEvalRun(db, {
    agentId: request.agentId,
    datasetId: request.datasetId,
    versionId: version.id,
    versionNumber: version.number,
  })
  setImmediate(() => {
    void execute(deps, evalRun, cases)
  })
  return evalRun
}
