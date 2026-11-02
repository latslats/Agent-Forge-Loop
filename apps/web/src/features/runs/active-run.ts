import { NodeEndPayload, RunEndPayload, type RunEvent, type RunStatus } from '@agentforgeloop/shared'
import { useSyncExternalStore } from 'react'

/**
 * The run the agent page is watching. The run console writes it from the SSE stream; the canvas
 * reads it to highlight nodes. One store, no provider, so the two features stay independent.
 */
export type ActiveRun = {
  runId: string | null
  agentId: string | null
  status: RunStatus | null
  runningNodeId: string | null
  finishedNodeIds: string[]
  failedNodeId: string | null
}

const EMPTY: ActiveRun = {
  runId: null,
  agentId: null,
  status: null,
  runningNodeId: null,
  finishedNodeIds: [],
  failedNodeId: null,
}

let state = EMPTY
const listeners = new Set<() => void>()
const emit = () => {
  for (const listener of listeners) listener()
}

const reduce = (current: ActiveRun, event: RunEvent): ActiveRun => {
  switch (event.kind) {
    case 'node_start':
      return { ...current, runningNodeId: event.nodeId }
    case 'approval_requested':
      return { ...current, status: 'waiting_approval' }
    case 'approval_resolved':
      return { ...current, status: 'running' }
    case 'node_end': {
      const payload = NodeEndPayload.safeParse(event.payload)
      const failed = payload.success && payload.data.status === 'failed'
      return {
        ...current,
        runningNodeId: null,
        finishedNodeIds:
          event.nodeId && !failed
            ? [...current.finishedNodeIds, event.nodeId]
            : current.finishedNodeIds,
        failedNodeId: failed ? event.nodeId : current.failedNodeId,
      }
    }
    case 'run_end': {
      const payload = RunEndPayload.safeParse(event.payload)
      return {
        ...current,
        runningNodeId: null,
        status: payload.success ? payload.data.status : current.status,
      }
    }
    default:
      return current
  }
}

export const activeRunStore = {
  get: (): ActiveRun => state,
  reset: (): void => {
    state = EMPTY
    emit()
  },
  start: (runId: string, agentId: string): void => {
    state = { ...EMPTY, runId, agentId, status: 'running' }
    emit()
  },
  apply: (event: RunEvent): void => {
    state = reduce(state, event)
    emit()
  },
  setStatus: (status: RunStatus): void => {
    state = { ...state, status }
    emit()
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

/** The active run, but only when it belongs to this agent. Other agents' runs read as empty. */
export const useActiveRun = (agentId: string): ActiveRun => {
  const current = useSyncExternalStore(activeRunStore.subscribe, activeRunStore.get)
  return current.agentId === agentId ? current : EMPTY
}
