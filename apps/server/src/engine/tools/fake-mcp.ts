import type { ToolDescriptor } from '@agentforgeloop/shared'
import type { McpClient } from './mcp.ts'
import type { ToolOutcome } from './registry.ts'

// Test-only: an MCP client with fixed tools that records what it was asked. Nothing in the app
// imports this file.

export type FakeMcpOptions = {
  tools?: ToolDescriptor[]
  /** When set, listTools throws this message. */
  listError?: string
  respond?: (name: string, input: unknown) => ToolOutcome
}

export const fakeMcp = (options: FakeMcpOptions = {}) => {
  const state = {
    listCalls: 0,
    closed: 0,
    calls: [] as Array<{ name: string; input: unknown }>,
  }
  const client: McpClient = {
    listTools: async () => {
      state.listCalls++
      if (options.listError !== undefined) throw new Error(options.listError)
      return options.tools ?? []
    },
    callTool: async (name, input) => {
      state.calls.push({ name, input })
      return options.respond?.(name, input) ?? { output: 'ok', isError: false }
    },
    close: async () => {
      state.closed++
    },
  }
  return { client, state }
}
