import { type Connection, McpConfig } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { waitFor } from '../testing.ts'
import { fakeMcp } from './fake-mcp.ts'
import { createToolRegistry } from './registry.ts'
import type { ToolDef } from './types.ts'

const mcpConnection = (id: string, enabledTools: string[] = []): Connection => ({
  id,
  kind: 'mcp',
  name: id,
  config: McpConfig.parse({ transport: 'http', url: `https://${id}.test/mcp` }),
  enabledTools,
  createdAt: '2026-01-01T00:00:00.000Z',
})

const lookupTool = {
  name: 'lookup',
  description: 'Find a record.',
  inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
}
const deleteTool = { name: 'delete', description: 'Remove.', inputSchema: { type: 'object' } }

const builtin: ToolDef = {
  connectionId: 'builtin',
  name: 'now',
  description: 'The time.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  run: async () => ({ output: 'now', isError: false }),
}

const xConfig = McpConfig.parse({ transport: 'http', url: 'https://x.test/mcp' })

describe('tool registry with MCP connections', () => {
  it('lists and resolves only the enabled MCP tools, under the connection id', async () => {
    const fake = fakeMcp({ tools: [lookupTool, deleteTool] })
    const connections = [mcpConnection('docs', ['lookup'])]
    const tools = createToolRegistry(
      [builtin],
      () => connections,
      () => fake.client,
    )
    await tools.refresh()

    expect(tools.list()).toEqual([
      { connectionId: 'builtin', tool: 'now', description: 'The time.' },
      { connectionId: 'docs', tool: 'lookup', description: 'Find a record.' },
    ])
    const [resolved] = tools.resolve([{ connectionId: 'docs', tool: 'lookup' }])
    expect(resolved?.tool).toMatchObject({
      name: 'docs__lookup',
      description: 'Find a record.',
      input_schema: { type: 'object', properties: { q: { type: 'string' } } },
      strict: false,
    })
    expect(() => tools.resolve([{ connectionId: 'docs', tool: 'delete' }])).toThrow(
      'Unknown tool "docs/delete"',
    )
  })

  it('applies an enabledTools change without listing the server again', async () => {
    const fake = fakeMcp({ tools: [lookupTool, deleteTool] })
    let connections = [mcpConnection('docs')]
    const tools = createToolRegistry(
      [],
      () => connections,
      () => fake.client,
    )
    await tools.refresh()
    expect(tools.list()).toEqual([])

    connections = [mcpConnection('docs', ['delete'])]

    expect(tools.list().map((t) => t.tool)).toEqual(['delete'])
    expect(fake.state.listCalls).toBe(1)
  })

  it('lists a connection the first time it is used, in the background', async () => {
    const fake = fakeMcp({ tools: [lookupTool] })
    const tools = createToolRegistry(
      [],
      () => [mcpConnection('docs', ['lookup'])],
      () => fake.client,
    )

    expect(tools.list()).toEqual([])
    await waitFor(() => tools.list().length === 1)
    expect(tools.list()[0]?.tool).toBe('lookup')
  })

  it('reports a listing error and does not list again until refresh', async () => {
    const fake = fakeMcp({ listError: 'connection refused' })
    const tools = createToolRegistry(
      [],
      () => [mcpConnection('docs')],
      () => fake.client,
    )

    expect(await tools.listing('docs')).toEqual({ tools: [], error: 'connection refused' })
    expect(await tools.listing('docs')).toEqual({ tools: [], error: 'connection refused' })
    expect(fake.state.listCalls).toBe(1)

    await tools.refresh('docs')
    expect(fake.state.listCalls).toBe(2)
  })

  it('returns the listed tools from listing, including ones not enabled', async () => {
    const fake = fakeMcp({ tools: [lookupTool, deleteTool] })
    const tools = createToolRegistry(
      [],
      () => [mcpConnection('docs')],
      () => fake.client,
    )

    expect(await tools.listing('docs')).toEqual({
      tools: [lookupTool, deleteTool],
      error: null,
    })
  })

  it('lists the built-in tools as a listing, with no error', async () => {
    const tools = createToolRegistry([builtin])

    expect(await tools.listing('builtin')).toEqual({
      tools: [{ name: 'now', description: 'The time.', inputSchema: builtin.inputSchema }],
      error: null,
    })
  })

  it('calls the MCP tool through its client and returns the outcome', async () => {
    const fake = fakeMcp({
      tools: [lookupTool],
      respond: () => ({ output: { answer: 42 }, isError: false }),
    })
    const tools = createToolRegistry(
      [],
      () => [mcpConnection('docs', ['lookup'])],
      () => fake.client,
    )
    await tools.refresh()

    const outcome = await tools.call(
      { connectionId: 'docs', tool: 'lookup' },
      { q: 'x' },
      new AbortController().signal,
    )

    expect(outcome).toEqual({ output: { answer: 42 }, isError: false })
    expect(fake.state.calls).toEqual([{ name: 'lookup', input: { q: 'x' } }])
  })

  it('closes the old client and forgets the connection when it is deleted', async () => {
    const fake = fakeMcp({ tools: [lookupTool] })
    let connections = [mcpConnection('docs', ['lookup'])]
    const tools = createToolRegistry(
      [],
      () => connections,
      () => fake.client,
    )
    await tools.refresh()

    connections = []
    await tools.refresh('docs')

    expect(fake.state.closed).toBe(1)
    expect(tools.list()).toEqual([])
    expect(await tools.listing('docs')).toEqual({ tools: [], error: null })
  })

  it('lists once for overlapping refreshes, closing each client it replaces', async () => {
    const made: Array<ReturnType<typeof fakeMcp>> = []
    const tools = createToolRegistry(
      [],
      () => [mcpConnection('docs', ['lookup'])],
      () => {
        const fake = fakeMcp({ tools: [lookupTool] })
        made.push(fake)
        return fake.client
      },
    )

    await Promise.all([tools.refresh('docs'), tools.refresh('docs')])

    expect(made.map((fake) => fake.state.closed)).toEqual([1, 0])
    expect(tools.list().map((t) => t.tool)).toEqual(['lookup'])

    await tools.close()
    expect(made.map((fake) => fake.state.closed)).toEqual([1, 1])
  })

  it('probe lists a config without keeping its client, and throws when listing fails', async () => {
    const ok = fakeMcp({ tools: [lookupTool] })
    const probeOk = createToolRegistry(
      [],
      () => [],
      () => ok.client,
    )
    expect(await probeOk.probe(xConfig)).toEqual([lookupTool])
    expect(ok.state.closed).toBe(1)

    const broken = fakeMcp({ listError: 'boom' })
    const probeBroken = createToolRegistry(
      [],
      () => [],
      () => broken.client,
    )
    await expect(probeBroken.probe(xConfig)).rejects.toThrow('boom')
  })

  it('closes every open client on close', async () => {
    const fake = fakeMcp({ tools: [lookupTool] })
    const tools = createToolRegistry(
      [],
      () => [mcpConnection('docs')],
      () => fake.client,
    )
    await tools.refresh()

    await tools.close()

    expect(fake.state.closed).toBe(1)
  })
})
