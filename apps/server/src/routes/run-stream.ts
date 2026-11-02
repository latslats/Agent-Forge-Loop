import { type RunEvent, SSE_DONE, SSE_RUN_EVENT } from '@agentforgeloop/shared'
import type { SSEStreamingApi } from 'hono/streaming'
import { getRun, listEvents } from '../db/runs.ts'
import type { EngineDeps } from '../engine/types.ts'

const KEEP_ALIVE_MS = 15_000

/**
 * Replays the stored events, then follows live ones from the bus until run_end, then sends
 * `done` with the final run. Subscribing before the replay means no event is missed; events seen
 * twice are dropped by seq.
 */
export const streamRunEvents = async (
  deps: EngineDeps,
  runId: string,
  stream: SSEStreamingApi,
): Promise<void> => {
  const queue: RunEvent[] = []
  let wake: (() => void) | undefined
  const unsubscribe = deps.bus.subscribe(runId, (event) => {
    queue.push(event)
    wake?.()
  })
  stream.onAbort(() => wake?.())

  let lastSeq = 0
  let ended = false
  const send = async (event: RunEvent): Promise<void> => {
    if (event.seq <= lastSeq) return
    lastSeq = event.seq
    await stream.writeSSE({
      event: SSE_RUN_EVENT,
      id: String(event.seq),
      data: JSON.stringify(event),
    })
    if (event.kind === 'run_end') ended = true
  }
  const waitForEvent = (): Promise<void> =>
    new Promise<void>((resolve) => {
      const finish = (): void => {
        clearTimeout(timer)
        wake = undefined
        resolve()
      }
      const timer = setTimeout(finish, KEEP_ALIVE_MS)
      wake = finish
    })

  try {
    for (const event of listEvents(deps.db, runId)) await send(event)
    while (!ended && !stream.aborted) {
      if (queue.length === 0) {
        await waitForEvent()
        if (queue.length === 0 && !ended && !stream.aborted) await stream.write(': keep-alive\n\n')
        continue
      }
      for (const event of queue.splice(0)) await send(event)
    }
    if (ended)
      await stream.writeSSE({ event: SSE_DONE, data: JSON.stringify(getRun(deps.db, runId)) })
  } finally {
    unsubscribe()
  }
}
