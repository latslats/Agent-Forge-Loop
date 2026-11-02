import { Run, RunEvent, runRoutes, SSE_DONE, SSE_RUN_EVENT } from '@agentforgeloop/shared'
import type { ZodType } from 'zod'

export type RunStreamHandlers = {
  onEvent: (event: RunEvent) => void
  onDone: (run: Run) => void
  onError: (message: string) => void
}

export type RunStream = { close: () => void }

const LOST_FEED = 'Lost the live feed for this run. Open the run to see its events.'
const BAD_EVENT = 'Received an event in an unexpected format.'

// Messages are untrusted text from the server; anything that does not match the schema is dropped.
function decode<T>(schema: ZodType<T>, data: unknown): T | null {
  if (typeof data !== 'string') return null
  try {
    const result = schema.safeParse(JSON.parse(data))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/**
 * Streams a run's events: the stored ones first, then live ones. Events are de-duplicated by seq,
 * so replay overlapping live events, or a reconnect, never shows a row twice.
 */
export function subscribeRun(runId: string, handlers: RunStreamHandlers): RunStream {
  const source = new EventSource(runRoutes.runEvents(runId))
  const seen = new Set<number>()
  let closed = false

  const close = () => {
    closed = true
    source.close()
  }

  source.addEventListener(SSE_RUN_EVENT, (message) => {
    if (closed) return
    const event = decode(RunEvent, message.data)
    if (!event) {
      handlers.onError(BAD_EVENT)
      return
    }
    if (seen.has(event.seq)) return
    seen.add(event.seq)
    handlers.onEvent(event)
  })

  source.addEventListener(SSE_DONE, (message) => {
    if (closed) return
    const run = decode(Run, message.data)
    close()
    if (run) handlers.onDone(run)
    else handlers.onError(LOST_FEED)
  })

  // The browser retries on its own while CONNECTING; only a CLOSED stream is reported.
  source.onerror = () => {
    if (closed || source.readyState !== EventSource.CLOSED) return
    close()
    handlers.onError(LOST_FEED)
  }

  return { close }
}
