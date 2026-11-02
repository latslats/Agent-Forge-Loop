import { Memory } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { createAgent } from '../db/agents.ts'
import { migrate, openDb } from '../db/sqlite.ts'
import { fakeLlm, testEngine, textMessage } from '../engine/testing.ts'

const json = (method: string, body?: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

const setup = () => {
  const db = openDb(':memory:')
  migrate(db)
  const app = createApp(
    db,
    testEngine(
      db,
      fakeLlm(async () => textMessage('')),
    ),
  )
  const agentId = createAgent(db, { name: 'Remembers', description: '' }).id
  return { app, agentId }
}

const listFacts = async (app: ReturnType<typeof setup>['app'], agentId: string) =>
  Memory.array().parse(await (await app.request(`/api/agents/${agentId}/memories`)).json())

describe('memory routes', () => {
  it('creates a memory with 201, lists it newest first and deletes one', async () => {
    const { app, agentId } = setup()

    const first = await app.request(
      `/api/agents/${agentId}/memories`,
      json('POST', { content: 'Customer prefers email' }),
    )
    const second = await app.request(
      `/api/agents/${agentId}/memories`,
      json('POST', { content: 'Refund limit is 50' }),
    )

    expect(first.status).toBe(201)
    expect(Memory.parse(await first.json())).toMatchObject({
      agentId,
      content: 'Customer prefers email',
      sourceRunId: null,
    })
    expect(second.status).toBe(201)
    const listed = await listFacts(app, agentId)
    expect(listed.map((memory) => memory.content)).toEqual([
      'Refund limit is 50',
      'Customer prefers email',
    ])

    const removed = await app.request(`/api/memories/${listed[0]?.id}`, json('DELETE'))
    expect(removed.status).toBe(204)
    expect(await listFacts(app, agentId)).toHaveLength(1)
    const again = await app.request(`/api/memories/${listed[0]?.id}`, json('DELETE'))
    expect(again.status).toBe(404)
  })

  it('clears all memories of the agent with 204', async () => {
    const { app, agentId } = setup()
    await app.request(`/api/agents/${agentId}/memories`, json('POST', { content: 'a' }))
    await app.request(`/api/agents/${agentId}/memories`, json('POST', { content: 'b' }))

    const cleared = await app.request(`/api/agents/${agentId}/memories`, json('DELETE'))

    expect(cleared.status).toBe(204)
    expect(await listFacts(app, agentId)).toEqual([])
  })

  it('answers 404 for an unknown agent and 400 for empty content', async () => {
    const { app, agentId } = setup()

    const unknownList = await app.request('/api/agents/nope/memories')
    const unknownCreate = await app.request(
      '/api/agents/nope/memories',
      json('POST', { content: 'x' }),
    )
    const unknownClear = await app.request('/api/agents/nope/memories', json('DELETE'))
    const empty = await app.request(
      `/api/agents/${agentId}/memories`,
      json('POST', { content: '' }),
    )

    expect(unknownList.status).toBe(404)
    expect(unknownCreate.status).toBe(404)
    expect(unknownClear.status).toBe(404)
    expect(empty.status).toBe(400)
  })
})
