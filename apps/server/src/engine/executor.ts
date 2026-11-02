import type {
  AgentDefinition,
  Edge,
  EdgeLabel,
  Node,
  Run,
  RunEvent,
  RunEventKind,
  RunStatus,
  TriggerKind,
} from '@agentforgeloop/shared'
import { expirePendingApprovals, listApprovals } from '../db/approvals.ts'
import {
  appendEvent,
  failInterruptedRuns,
  getRun,
  insertRun,
  loadRun,
  type RunPatch,
  resolveVersion,
  updateRun,
} from '../db/runs.ts'
import { type Db, nowIso } from '../db/sqlite.ts'
import { errorMessage } from '../errors.ts'
import { runNode } from './nodes/index.ts'
import type { EngineDeps, NodeIo, NodeOutcome, RunState } from './types.ts'

const CANCELLABLE: readonly RunStatus[] = ['queued', 'running', 'waiting_approval']

/** One controller per run that is currently walking its graph in this process. */
const active = new Map<string, AbortController>()

export type Ctx = {
  runId: string
  definition: AgentDefinition
  state: RunState
  startedAt: string
  controller: AbortController
}

const initialState = (input: unknown): RunState => ({
  input,
  vars: {},
  prev: null,
  nodeId: null,
  costUsd: 0,
  tokensIn: 0,
  tokensOut: 0,
  toolsUsed: [],
})

const statePatch = (state: RunState): RunPatch => ({
  state,
  tokensIn: state.tokensIn,
  tokensOut: state.tokensOut,
  costUsd: state.costUsd,
})

/** The edge to follow: one with the requested label, else one with no label, else none. */
export const nextNode = (
  definition: AgentDefinition,
  fromId: string,
  label?: EdgeLabel,
): string | null => {
  const outgoing: Edge[] = definition.edges.filter((edge) => edge.from === fromId)
  const match =
    (label !== undefined ? outgoing.find((edge) => edge.label === label) : undefined) ??
    outgoing.find((edge) => edge.label === undefined)
  return match?.to ?? null
}

const findNode = (definition: AgentDefinition, id: string): Node => {
  const node = definition.nodes.find((candidate) => candidate.id === id)
  if (!node) throw new Error(`Node "${id}" is not in the run's version`)
  return node
}

export const emitEvent = (
  deps: EngineDeps,
  runId: string,
  kind: RunEventKind,
  nodeId: string | null,
  payload: Record<string, unknown>,
): RunEvent => {
  const event = appendEvent(deps.db, runId, kind, nodeId, payload)
  deps.bus.publish(runId, event)
  return event
}

const makeIo = (deps: EngineDeps, ctx: Ctx): NodeIo => ({
  runId: ctx.runId,
  definition: ctx.definition,
  deps,
  signal: ctx.controller.signal,
  emit: (kind, nodeId, payload) => {
    // cancelRun has already stored run_end, so nothing may be stored after it. The throw ends the step.
    if (ctx.controller.signal.aborted) throw new Error('The run was cancelled')
    return emitEvent(deps, ctx.runId, kind, nodeId, payload)
  },
})

/** Milliseconds since the newest approval for this node was requested; 0 when there is none. */
export const waitedMs = (deps: EngineDeps, runId: string, nodeId: string | null): number => {
  const requested = listApprovals(deps.db, runId)
    .filter((a) => a.nodeId === nodeId)
    .at(-1)
  return requested ? Date.now() - Date.parse(requested.requestedAt) : 0
}

const invoke = async (node: Node, ctx: Ctx, io: NodeIo): Promise<NodeOutcome> => {
  try {
    return await runNode(node, ctx.state, io)
  } catch (err) {
    return { type: 'fail', error: errorMessage(err) }
  }
}

const failRun = (deps: EngineDeps, ctx: Ctx, message: string, nodeId: string | null): void => {
  emitEvent(deps, ctx.runId, 'error', nodeId, { message })
  finish(deps, ctx, 'failed', message)
}

/** Writes the final status, then announces run_end. The status is saved first so that a
 *  stream that sees run_end can read the final run. */
export const finish = (
  deps: EngineDeps,
  ctx: Ctx,
  status: 'succeeded' | 'failed',
  error: string | null,
): void => {
  const finishedAt = nowIso()
  updateRun(deps.db, ctx.runId, {
    ...statePatch(ctx.state),
    status,
    ...(status === 'succeeded' ? { output: ctx.state.prev } : {}),
    error,
    finishedAt,
  })
  const durationMs = Date.parse(finishedAt) - Date.parse(ctx.startedAt)
  emitEvent(deps, ctx.runId, 'run_end', null, {
    status,
    costUsd: ctx.state.costUsd,
    durationMs,
  })
  active.delete(ctx.runId)
}

/** Follows edges from `first` until the run succeeds, fails, waits or is cancelled. */
const walk = async (deps: EngineDeps, ctx: Ctx, first: string): Promise<void> => {
  let nodeId: string | null = first
  while (nodeId !== null) {
    const node = findNode(ctx.definition, nodeId)
    if (ctx.controller.signal.aborted) return
    emitEvent(deps, ctx.runId, 'node_start', node.id, { type: node.type })
    const started = Date.now()
    const outcome = await invoke(node, ctx, makeIo(deps, ctx))
    // A cancelled run was already finished by cancelRun; touch nothing more.
    if (ctx.controller.signal.aborted) return
    const durationMs = Date.now() - started

    if (outcome.type === 'wait') {
      ctx.state.nodeId = node.id
      updateRun(deps.db, ctx.runId, { ...statePatch(ctx.state), status: 'waiting_approval' })
      active.delete(ctx.runId)
      return
    }
    if (outcome.type === 'fail') {
      emitEvent(deps, ctx.runId, 'error', node.id, { message: outcome.error })
      emitEvent(deps, ctx.runId, 'node_end', node.id, { status: 'failed', durationMs })
      finish(deps, ctx, 'failed', outcome.error)
      return
    }

    if (outcome.prev !== undefined) ctx.state.prev = outcome.prev
    ctx.state.nodeId = node.id
    emitEvent(deps, ctx.runId, 'node_end', node.id, { status: 'ok', durationMs })
    updateRun(deps.db, ctx.runId, statePatch(ctx.state))
    if (node.type === 'output') {
      finish(deps, ctx, 'succeeded', null)
      return
    }
    nodeId = nextNode(ctx.definition, node.id, outcome.label)
    if (nodeId === null) failRun(deps, ctx, `no edge leaves node "${node.id}"`, node.id)
  }
}

const begin = (
  runId: string,
  definition: AgentDefinition,
  state: RunState,
  startedAt: string,
): Ctx => {
  const controller = new AbortController()
  active.set(runId, controller)
  return { runId, definition, state, startedAt, controller }
}

/** Runs the walk and turns an unexpected throw into a failed run, unless it was cancelled. */
const drive = async (deps: EngineDeps, ctx: Ctx, first: string | null): Promise<void> => {
  try {
    if (first === null) failRun(deps, ctx, `no edge leaves node "${ctx.state.nodeId}"`, null)
    else await walk(deps, ctx, first)
  } catch (err) {
    if (!ctx.controller.signal.aborted) failRun(deps, ctx, errorMessage(err), ctx.state.nodeId)
  }
}

/** Creates the run as queued and starts it on the next tick. Returns before any node runs. */
export const startRun = (
  deps: EngineDeps,
  request: {
    agentId: string
    versionNumber?: number
    triggerKind: TriggerKind
    input: unknown
  },
): Run => {
  const version = resolveVersion(deps.db, request.agentId, request.versionNumber)
  const input = request.input ?? null
  const run = insertRun(deps.db, {
    agentId: request.agentId,
    versionId: version.id,
    versionNumber: version.number,
    triggerKind: request.triggerKind,
    input,
    state: initialState(input),
  })
  setImmediate(() => {
    executeRun(deps, run.id).catch((err: unknown) => console.error(err))
  })
  return run
}

/** Starts a queued run from its trigger. A run cancelled while queued is left alone. */
export const executeRun = async (deps: EngineDeps, runId: string): Promise<void> => {
  const { run, definition, state } = loadRun(deps.db, runId)
  if (run.status !== 'queued') return
  const startedAt = nowIso()
  updateRun(deps.db, runId, { status: 'running', startedAt })
  emitEvent(deps, runId, 'run_start', null, { versionNumber: run.versionNumber })
  // validateDefinition guarantees exactly one trigger node.
  const trigger = definition.nodes.find((node) => node.type === 'trigger')
  if (!trigger) throw new Error('The version has no trigger node')
  await drive(deps, begin(runId, definition, state, startedAt), trigger.id)
}

/** Continues a run that paused on an approval, from the edge after the approval node. */
export const resumeRun = async (deps: EngineDeps, runId: string): Promise<void> => {
  const { run, definition, state } = loadRun(deps.db, runId)
  if (run.status !== 'waiting_approval' || state.nodeId === null) return
  updateRun(deps.db, runId, { status: 'running' })
  emitEvent(deps, runId, 'node_end', state.nodeId, {
    status: 'ok',
    durationMs: waitedMs(deps, runId, state.nodeId),
  })
  const next = nextNode(definition, state.nodeId)
  await drive(deps, begin(runId, definition, state, run.startedAt ?? nowIso()), next)
}

/** Aborts a live run and marks it cancelled. A run that already ended is returned unchanged. */
export const cancelRun = (deps: EngineDeps, runId: string): Run => {
  const run = getRun(deps.db, runId)
  if (!CANCELLABLE.includes(run.status)) return run
  active.get(runId)?.abort()
  active.delete(runId)
  const finishedAt = nowIso()
  const durationMs = run.startedAt ? Date.parse(finishedAt) - Date.parse(run.startedAt) : 0
  updateRun(deps.db, runId, { status: 'cancelled', finishedAt })
  expirePendingApprovals(deps.db, runId)
  emitEvent(deps, runId, 'run_end', null, { status: 'cancelled', costUsd: run.costUsd, durationMs })
  return getRun(deps.db, runId)
}

/** At boot, runs left queued or running by a crash are failed, each with a run_end event. */
export const recoverInterruptedRuns = (db: Db): void => {
  for (const run of failInterruptedRuns(db)) {
    const durationMs =
      run.startedAt && run.finishedAt ? Date.parse(run.finishedAt) - Date.parse(run.startedAt) : 0
    appendEvent(db, run.id, 'run_end', null, {
      status: 'failed',
      costUsd: run.costUsd,
      durationMs,
    })
  }
}
