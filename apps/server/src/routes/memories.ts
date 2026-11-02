import { CreateMemoryBody } from '@agentforgeloop/shared'
import { Hono } from 'hono'
import { clearMemories, createMemory, listMemories, removeMemory } from '../db/memories.ts'
import type { Db } from '../db/sqlite.ts'
import { readJson } from './read-json.ts'

// Mounted at /api, so paths here carry the full suffix, e.g. '/agents/:id/memories'.
export const memoryRoutes = (db: Db) => {
  const api = new Hono()

  api.get('/agents/:id/memories', (c) => c.json(listMemories(db, c.req.param('id'))))

  api.post('/agents/:id/memories', async (c) => {
    const body = CreateMemoryBody.parse(await readJson(c))
    return c.json(createMemory(db, c.req.param('id'), body.content), 201)
  })

  api.delete('/agents/:id/memories', (c) => {
    clearMemories(db, c.req.param('id'))
    return c.body(null, 204)
  })

  api.delete('/memories/:id', (c) => {
    removeMemory(db, c.req.param('id'))
    return c.body(null, 204)
  })

  return api
}
