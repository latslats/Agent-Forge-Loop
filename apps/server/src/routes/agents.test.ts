import {
  Agent,
  AgentVersion,
  AgentWithVersions,
  ApiError,
  defaultDefinition,
} from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { migrate, openDb } from '../db/sqlite.ts'

const json = (method: string, body?: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

const setup = () => {
  const db = openDb(':memory:')
  migrate(db)
  return createApp(db)
}

describe('agents routes', () => {
  it('runs the agent lifecycle: create, read, patch, publish twice, delete', async () => {
    const app = setup()

    const created = await app.request('/api/agents', json('POST', { name: 'Triage' }))
    expect(created.status).toBe(201)
    const agent = Agent.parse(await created.json())
    expect(agent).toMatchObject({ name: 'Triage', status: 'draft', currentVersion: null })

    const list = await app.request('/api/agents')
    expect(await list.json()).toHaveLength(1)

    const detail = await app.request(`/api/agents/${agent.id}`)
    expect(AgentWithVersions.parse(await detail.json()).versions).toEqual([])

    const draft = { ...defaultDefinition('Triage'), description: 'Triage support email' }
    const patched = await app.request(`/api/agents/${agent.id}`, json('PATCH', { draft }))
    expect(patched.status).toBe(200)
    expect(Agent.parse(await patched.json()).draft.description).toBe('Triage support email')

    const broken = { ...draft, edges: [...draft.edges, { id: 'bad', from: 'step-1', to: 'ghost' }] }
    const rejected = await app.request(`/api/agents/${agent.id}`, json('PATCH', { draft: broken }))
    expect(rejected.status).toBe(400)
    const error = ApiError.parse(await rejected.json())
    expect(error.error).toBe('invalid definition')
    expect(error.details).toContain('Edge "bad" ends at unknown node "ghost"')

    const first = await app.request(
      `/api/agents/${agent.id}/versions`,
      json('POST', { note: 'v1' }),
    )
    expect(first.status).toBe(201)
    expect(AgentVersion.parse(await first.json()).number).toBe(1)
    const second = await app.request(`/api/agents/${agent.id}/versions`, json('POST', {}))
    expect(AgentVersion.parse(await second.json()).number).toBe(2)

    const published = AgentWithVersions.parse(
      await (await app.request(`/api/agents/${agent.id}`)).json(),
    )
    expect(published).toMatchObject({ status: 'active', currentVersion: 2 })
    expect(published.versions.map((v) => v.number)).toEqual([1, 2])

    const deleted = await app.request(`/api/agents/${agent.id}`, json('DELETE'))
    expect(deleted.status).toBe(204)
    const gone = await app.request(`/api/agents/${agent.id}`)
    expect(gone.status).toBe(404)
  })

  it('answers a body that fails validation with 400 and the zod issues', async () => {
    const app = setup()
    const res = await app.request('/api/agents', json('POST', {}))
    expect(res.status).toBe(400)
    const error = ApiError.parse(await res.json())
    expect(error.error).toBe('validation')
    expect(Array.isArray(error.details)).toBe(true)
  })

  it('rejects a malformed JSON body instead of treating it as empty', async () => {
    const app = setup()
    const created = await app.request('/api/agents', json('POST', { name: 'Triage' }))
    const agent = Agent.parse(await created.json())

    const res = await app.request(`/api/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{"name": ',
    })
    expect(res.status).toBe(400)
    expect(ApiError.parse(await res.json()).error).toBe('invalid JSON')

    const unchanged = Agent.parse(await (await app.request(`/api/agents/${agent.id}`)).json())
    expect(unchanged.name).toBe('Triage')
  })

  it('keeps the draft name and description in step with the agent row', async () => {
    const app = setup()
    const created = await app.request(
      '/api/agents',
      json('POST', { name: 'Triage', description: 'First' }),
    )
    const agent = Agent.parse(await created.json())
    expect(agent.draft).toMatchObject({ name: 'Triage', description: 'First' })

    await app.request(`/api/agents/${agent.id}`, json('PATCH', { name: 'Renamed' }))
    const draft = { ...defaultDefinition('Triage'), description: 'Second' }
    await app.request(`/api/agents/${agent.id}`, json('PATCH', { draft }))

    const current = Agent.parse(await (await app.request(`/api/agents/${agent.id}`)).json())
    expect(current).toMatchObject({ name: 'Renamed', description: 'Second' })
    expect(current.draft).toMatchObject({ name: 'Renamed', description: 'Second' })
  })
})
