import { AgentDefinition, McpConfig } from '@agentforgeloop/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createConnection, listConnections, updateConnection } from '../../db/connections.ts'
import { getRun, listEvents } from '../../db/runs.ts'
import { type Db, migrate, openDb } from '../../db/sqlite.ts'
import { startRun } from '../executor.ts'
import {
  fakeLlm,
  publishAgent,
  testEngine,
  textMessage,
  toolUseMessage,
  waitFor,
} from '../testing.ts'
import { fakeMcp } from './fake-mcp.ts'
import { createToolRegistry } from './registry.ts'

const pos = { x: 0, y: 0 }

let db: Db
beforeEach(() => {
  db = openDb(':memory:')
  migrate(db)
})
afterEach(async () => {
  // A started run may still be waiting on its setImmediate; let it see the open database.
  await new Promise((resolve) => setTimeout(resolve, 20))
  db.close()
})

describe('an AI step calling an MCP tool', () => {
  it('runs the enabled MCP tool through the executor and finishes the run', async () => {
    const connection = createConnection(db, {
      name: 'Docs',
      config: McpConfig.parse({ transport: 'http', url: 'https://docs.test/mcp' }),
    })
    updateConnection(db, connection.id, { enabledTools: ['lookup'] })
    const fake = fakeMcp({
      tools: [
        {
          name: 'lookup',
          description: 'Find a record.',
          inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
        },
      ],
      respond: () => ({ output: { answer: 42 }, isError: false }),
    })
    const tools = createToolRegistry(
      [],
      () => listConnections(db),
      () => fake.client,
    )
    await tools.refresh()

    const definition = AgentDefinition.parse({
      name: 'Docs agent',
      nodes: [
        { id: 'trigger', type: 'trigger', label: 'Trigger', position: pos },
        {
          id: 'ai',
          type: 'ai',
          label: 'AI',
          prompt: 'Look it up.',
          tools: [{ connectionId: connection.id, tool: 'lookup' }],
          position: pos,
        },
        { id: 'out', type: 'output', label: 'Out', template: '', position: pos },
      ],
      edges: [
        { id: 'e1', from: 'trigger', to: 'ai' },
        { id: 'e2', from: 'ai', to: 'out' },
      ],
    })
    let turn = 0
    const llm = fakeLlm(async () =>
      turn++ === 0
        ? toolUseMessage([{ id: 'call-1', name: `${connection.id}__lookup`, input: { q: 'x' } }])
        : textMessage('The answer is 42'),
    )
    const deps = { ...testEngine(db, llm), tools }
    const agentId = publishAgent(db, definition)

    const run = startRun(deps, { agentId, triggerKind: 'manual', input: 'x' })
    await waitFor(() => ['succeeded', 'failed', 'cancelled'].includes(getRun(db, run.id).status))

    expect(getRun(db, run.id).status).toBe('succeeded')
    expect(fake.state.calls).toEqual([{ name: 'lookup', input: { q: 'x' } }])
    expect(listEvents(db, run.id).map((event) => event.kind)).toContain('tool_result')
  })
})
