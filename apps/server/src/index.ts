import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type { Hono } from 'hono'
import { z } from 'zod'
import { createApp } from './app.ts'
import { listConnections } from './db/connections.ts'
import { failInterruptedEvalRuns } from './db/evals.ts'
import { migrate, openDb } from './db/sqlite.ts'
import { RunBus } from './engine/bus.ts'
import { recoverInterruptedRuns } from './engine/executor.ts'
import { createLlm } from './engine/llm.ts'
import { builtinTools } from './engine/tools/builtin.ts'
import { createToolRegistry } from './engine/tools/registry.ts'
import type { EngineDeps } from './engine/types.ts'
import { startScheduler } from './scheduler.ts'
import { seedExample } from './seed.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

// Static files first; unknown non-API paths fall back to index.html for client-side routes.
// index.html is read per request so a rebuilt web app is picked up without a restart.
const serveWeb = (app: Hono, dir: string): void => {
  app.use('/*', serveStatic({ root: dir }))
  app.get('*', (c) =>
    c.req.path.startsWith('/api/')
      ? c.json({ error: 'not found' }, 404)
      : c.html(readFileSync(join(dir, 'index.html'), 'utf8')),
  )
}

const envFile = resolve(root, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const env = z
  .object({
    PORT: z.coerce.number().int().positive().default(8787),
    DB_PATH: z.string().default('data/agentforgeloop.db'),
    ANTHROPIC_API_KEY: z.string().optional(),
  })
  .parse(process.env)

const dbPath = resolve(root, env.DB_PATH)
mkdirSync(dirname(dbPath), { recursive: true })
const db = openDb(dbPath)
migrate(db)
seedExample(db)
recoverInterruptedRuns(db)
failInterruptedEvalRuns(db)

const tools = createToolRegistry(builtinTools, () => listConnections(db))
// Lists the MCP servers in the background; a run only sees their tools once they are listed.
void tools.refresh()

const engine: EngineDeps = {
  db,
  llm: createLlm(env.ANTHROPIC_API_KEY),
  tools,
  bus: new RunBus(),
  apiKey: env.ANTHROPIC_API_KEY,
}
const scheduler = startScheduler(engine)
const app = createApp(db, engine, scheduler)
const webDist = resolve(root, 'apps/web/dist')
if (existsSync(webDist)) serveWeb(app, webDist)

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Agent Forge Loop server running at http://localhost:${info.port}`)
})
