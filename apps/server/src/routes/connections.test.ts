import { ConnectionView } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { listConnections } from '../db/connections.ts'
import { migrate, openDb } from '../db/sqlite.ts'
import { fakeLlm, testEngine, textMessage } from '../engine/testing.ts'
import { builtinTools } from '../engine/tools/builtin.ts'
import { type FakeMcpOptions, fakeMcp } from '../engine/tools/fake-mcp.ts'
import { createToolRegistry } from '../engine/tools/registry.ts'
import type { EngineDeps } from '../engine/types.ts'
import { seedExample } from '../seed.ts'

const json = (method: string, body?: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

const lookupTool = {
  name: 'lookup',
  description: 'Find a record.',
  inputSchema: { type: 'object', properties: {} },
}
const docs = { name: 'Docs', config: { transport: 'http', url: 'https://docs.test/mcp' } }

const setup = (options: FakeMcpOptions = { tools: [lookupTool] }) => {
  const db = openDb(':memory:')
  migrate(db)
  seedExample(db)
  const fake = fakeMcp(options)
  const engine: EngineDeps = {
    ...testEngine(
      db,
      fakeLlm(async () => textMessage('')),
    ),
    tools: createToolRegistry(
      builtinTools,
      () => listConnections(db),
      () => fake.client,
    ),
  }
  return { app: createApp(db, engine), db, fake }
}

describe('connection routes', () => {
  it('creates a connection with 201 and reports the tools its server lists', async () => {
    const { app } = setup()

    const res = await app.request('/api/connections', json('POST', docs))

    expect(res.status).toBe(201)
    expect(ConnectionView.parse(await res.json())).toMatchObject({
      kind: 'mcp',
      name: 'Docs',
      status: 'ok',
      error: null,
      tools: [lookupTool],
    })
  })

  it('answers 502 with the error when the server cannot be listed, and saves nothing', async () => {
    const { app, db } = setup({ listError: 'connection refused' })

    const res = await app.request('/api/connections', json('POST', docs))

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'connection refused' })
    expect(listConnections(db).map((c) => c.kind)).toEqual(['builtin'])
  })

  it('enables tools by name with PATCH, and answers 400 for a name the server does not list', async () => {
    const { app, db } = setup()
    const created = ConnectionView.parse(
      await (await app.request('/api/connections', json('POST', docs))).json(),
    )

    const ok = await app.request(
      `/api/connections/${created.id}`,
      json('PATCH', { enabledTools: ['lookup'] }),
    )
    expect(ok.status).toBe(200)
    expect(ConnectionView.parse(await ok.json()).enabledTools).toEqual(['lookup'])

    const bad = await app.request(
      `/api/connections/${created.id}`,
      json('PATCH', { enabledTools: ['nope'] }),
    )
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'unknown tool nope' })
    expect(listConnections(db).find((c) => c.id === created.id)?.enabledTools).toEqual(['lookup'])
  })

  it('answers 409 when the built-in connection is deleted', async () => {
    const { app, db } = setup()

    const res = await app.request('/api/connections/builtin', json('DELETE'))

    expect(res.status).toBe(409)
    expect(listConnections(db).map((c) => c.id)).toContain('builtin')
  })

  it('deletes an MCP connection with 204 and no body', async () => {
    const { app, db } = setup()
    const created = ConnectionView.parse(
      await (await app.request('/api/connections', json('POST', docs))).json(),
    )

    const res = await app.request(`/api/connections/${created.id}`, json('DELETE'))

    expect(res.status).toBe(204)
    expect(listConnections(db).map((c) => c.id)).toEqual(['builtin'])
  })

  it('lists the built-in tools as its view, with status builtin', async () => {
    const { app } = setup()

    const listed = (await (await app.request('/api/connections')).json()) as unknown[]
    const builtin = ConnectionView.parse(listed[0])

    expect(builtin).toMatchObject({ id: 'builtin', status: 'builtin', error: null })
    expect(builtin.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['now', 'http_request']),
    )
  })

  it('lists the server again on POST refresh', async () => {
    const { app, fake } = setup()
    const created = ConnectionView.parse(
      await (await app.request('/api/connections', json('POST', docs))).json(),
    )
    const before = fake.state.listCalls

    const res = await app.request(`/api/connections/${created.id}/refresh`, json('POST'))

    expect(res.status).toBe(200)
    expect(fake.state.listCalls).toBe(before + 1)
  })
})
