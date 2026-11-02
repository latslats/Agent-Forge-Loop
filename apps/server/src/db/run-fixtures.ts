import { type Db, get, newId, run } from './sqlite.ts'

// Test-only: inserts runs with fixed timestamps, so health and insights tests can use exact windows.
// Nothing in the app imports this file.

export type SeedRun = {
  agentId: string
  status: string
  costUsd?: number
  createdAt: string
  startedAt?: string | null
  finishedAt?: string | null
  events?: Array<{ kind: string; payload: Record<string, unknown> }>
}

/** Inserts a run of the agent's latest version and its events. Returns the run id. */
export const seedRun = (db: Db, spec: SeedRun): string => {
  const version = get<{ id: string; number: number }>(
    db,
    'SELECT id, number FROM agent_versions WHERE agent_id = ? ORDER BY number DESC LIMIT 1',
    [spec.agentId],
  )
  if (!version) throw new Error(`Agent ${spec.agentId} has no version`)
  const id = newId()
  run(
    db,
    'INSERT INTO runs (id, agent_id, version_id, version_number, trigger_kind, status, input_json, output_json, state_json, tokens_in, tokens_out, cost_usd, error, started_at, finished_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, 0, ?, NULL, ?, ?, ?)',
    [
      id,
      spec.agentId,
      version.id,
      version.number,
      'manual',
      spec.status,
      'null',
      spec.costUsd ?? 0,
      spec.startedAt ?? null,
      spec.finishedAt ?? null,
      spec.createdAt,
    ],
  )
  const events = spec.events ?? []
  for (const [index, event] of events.entries()) {
    run(
      db,
      'INSERT INTO run_events (id, run_id, seq, ts, kind, node_id, payload_json) VALUES (?, ?, ?, ?, ?, NULL, ?)',
      [newId(), id, index + 1, spec.createdAt, event.kind, JSON.stringify(event.payload)],
    )
  }
  return id
}
