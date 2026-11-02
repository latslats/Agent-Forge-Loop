import { EventEmitter } from 'node:events'
import type { RunEvent } from '@agentforgeloop/shared'

/** In-memory fan-out of run events to live SSE subscribers. One emitter, keyed by run id. */
export class RunBus {
  private readonly emitter = new EventEmitter()

  constructor() {
    // One listener per open SSE connection; the default limit of 10 is too low.
    this.emitter.setMaxListeners(0)
  }

  publish(runId: string, event: RunEvent): void {
    this.emitter.emit(runId, event)
  }

  /** Returns the unsubscribe function. */
  subscribe(runId: string, listener: (event: RunEvent) => void): () => void {
    this.emitter.on(runId, listener)
    return () => {
      this.emitter.off(runId, listener)
    }
  }
}
