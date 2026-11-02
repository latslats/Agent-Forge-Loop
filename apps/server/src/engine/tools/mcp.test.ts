import { McpConfig } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { createMcpClient } from './mcp.ts'

// These tests never reach a real server: each config fails before any request is sent.

describe('createMcpClient', () => {
  it('rejects listTools for an HTTP config with no url', async () => {
    const client = createMcpClient(McpConfig.parse({ transport: 'http' }))
    await expect(client.listTools()).rejects.toThrow('An HTTP connection needs a url')
    await client.close()
  })

  it('rejects listTools for a stdio config with no command', async () => {
    const client = createMcpClient(McpConfig.parse({ transport: 'stdio' }))
    await expect(client.listTools()).rejects.toThrow('A stdio connection needs a command')
    await client.close()
  })

  it('answers callTool with isError when the server cannot start, and never throws', async () => {
    const client = createMcpClient(
      McpConfig.parse({ transport: 'stdio', command: '/nonexistent/agentforgeloop-test-server' }),
    )
    const outcome = await client.callTool('anything', { q: 1 }, new AbortController().signal)

    expect(outcome.isError).toBe(true)
    expect(typeof outcome.output).toBe('string')
    await client.close()
  })

  it('closes a client that never connected without throwing', async () => {
    const client = createMcpClient(McpConfig.parse({ transport: 'http', url: 'https://x.test' }))
    await expect(client.close()).resolves.toBeUndefined()
  })
})
