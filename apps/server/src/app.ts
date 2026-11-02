import { readFileSync } from 'node:fs'
import type { Health } from '@agentforgeloop/shared'
import { Hono } from 'hono'
import { ZodError, z } from 'zod'
import type { Db } from './db/sqlite.ts'
import { RunBus } from './engine/bus.ts'
import { createLlm } from './engine/llm.ts'
import { createToolRegistry } from './engine/tools/registry.ts'
import type { EngineDeps } from './engine/types.ts'
import {
  ConflictError,
  DraftError,
  InvalidDefinitionError,
  NotFoundError,
  ValidationError,
} from './errors.ts'
import { agentRoutes } from './routes/agents.ts'
import { approvalRoutes } from './routes/approvals.ts'
import { connectionRoutes } from './routes/connections.ts'
import { draftRoutes } from './routes/draft.ts'
import { evalRoutes } from './routes/evals.ts'
import { hookRoutes } from './routes/hooks.ts'
import { insightRoutes } from './routes/insights.ts'
import { memoryRoutes } from './routes/memories.ts'
import { runRoutes } from './routes/runs.ts'
import { triggerRoutes } from './routes/triggers.ts'
import type { Scheduler } from './scheduler.ts'

const { version } = z
  .object({ version: z.string() })
  .parse(JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')))

// Without a key the engine's LLM calls fail with a clear message; the index passes the real deps
// and the real scheduler. Tests get a scheduler that does nothing.
export const createApp = (
  db: Db,
  engine: EngineDeps = {
    db,
    llm: createLlm(undefined),
    tools: createToolRegistry(),
    bus: new RunBus(),
  },
  scheduler: Scheduler = { reload: () => {}, stop: () => {} },
) => {
  const app = new Hono()
  const health: Health = { ok: true, version }

  app.get('/api/health', (c) => c.json(health))
  app.route('/api/agents', agentRoutes(db))
  app.route('/api', runRoutes(engine))
  app.route('/api', approvalRoutes(engine))
  app.route('/api', evalRoutes(db, engine))
  app.route('/api', draftRoutes(db, engine))
  app.route('/api', insightRoutes(db, engine))
  app.route('/api', triggerRoutes(db, engine, scheduler))
  app.route('/api', connectionRoutes(db, engine))
  app.route('/api', memoryRoutes(db))
  app.route('/hooks', hookRoutes(db, engine))

  app.onError((err, c) => {
    if (err instanceof ZodError) return c.json({ error: 'validation', details: err.issues }, 400)
    if (err instanceof InvalidDefinitionError)
      return c.json({ error: 'invalid definition', details: err.details }, 400)
    if (err instanceof SyntaxError) return c.json({ error: 'invalid JSON' }, 400)
    if (err instanceof ValidationError) return c.json({ error: err.message }, 400)
    if (err instanceof NotFoundError) return c.json({ error: err.message }, 404)
    if (err instanceof DraftError) return c.json({ error: err.message }, 502)
    if (err instanceof ConflictError) return c.json({ error: err.message }, 409)
    console.error(err)
    return c.json({ error: err.message }, 500)
  })

  return app
}
