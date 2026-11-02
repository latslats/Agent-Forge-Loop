import {
  type Connection,
  ConnectionView,
  CreateConnectionBody,
  type McpConfig,
  type ToolDescriptor,
  UpdateConnectionBody,
} from '@agentforgeloop/shared'
import { Hono } from 'hono'
import {
  createConnection,
  deleteConnection,
  getConnection,
  listConnections,
  updateConnection,
} from '../db/connections.ts'
import type { Db } from '../db/sqlite.ts'
import type { EngineDeps } from '../engine/types.ts'
import { errorMessage } from '../errors.ts'
import { readJson } from './read-json.ts'

/** The tools a connection offers. Throws when the server cannot be listed (the caller answers 502). */
const toolsFor = async (
  engine: EngineDeps,
  connectionId: string,
  config?: McpConfig,
): Promise<ToolDescriptor[]> => {
  if (config) return engine.tools.probe(config)
  const listing = await engine.tools.listing(connectionId)
  if (listing.error) throw new Error(listing.error)
  return listing.tools
}

// Mounted at /api, so paths here carry the full suffix, e.g. '/connections/:id/refresh'.
export const connectionRoutes = (db: Db, engine: EngineDeps) => {
  const api = new Hono()

  const view = async (connection: Connection): Promise<ConnectionView> => {
    const listing = await engine.tools.listing(connection.id)
    return ConnectionView.parse({
      ...connection,
      tools: listing.tools,
      status: connection.kind === 'builtin' ? 'builtin' : listing.error ? 'error' : 'ok',
      error: listing.error,
    })
  }

  api.get('/connections', async (c) =>
    c.json(await Promise.all(listConnections(db).map((connection) => view(connection)))),
  )

  api.post('/connections', async (c) => {
    const body = CreateConnectionBody.parse(await readJson(c))
    try {
      await engine.tools.probe(body.config)
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 502)
    }
    const connection = createConnection(db, body)
    await engine.tools.refresh(connection.id)
    return c.json(await view(connection), 201)
  })

  api.patch('/connections/:id', async (c) => {
    const id = c.req.param('id')
    const patch = UpdateConnectionBody.parse(await readJson(c))
    getConnection(db, id)
    if (patch.enabledTools) {
      let known: ToolDescriptor[]
      try {
        known = await toolsFor(engine, id, patch.config)
      } catch (err) {
        return c.json({ error: errorMessage(err) }, 502)
      }
      const names = new Set(known.map((tool) => tool.name))
      const unknown = patch.enabledTools.find((name) => !names.has(name))
      if (unknown !== undefined) return c.json({ error: `unknown tool ${unknown}` }, 400)
    }
    const connection = updateConnection(db, id, patch)
    if (patch.config) await engine.tools.refresh(id)
    return c.json(await view(connection))
  })

  api.post('/connections/:id/refresh', async (c) => {
    const id = c.req.param('id')
    const connection = getConnection(db, id)
    await engine.tools.refresh(id)
    return c.json(await view(connection))
  })

  api.delete('/connections/:id', async (c) => {
    const id = c.req.param('id')
    deleteConnection(db, id)
    await engine.tools.refresh(id)
    return c.body(null, 204)
  })

  return api
}
