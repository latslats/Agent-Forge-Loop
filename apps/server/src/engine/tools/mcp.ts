import { type McpConfig, ToolDescriptor } from '@agentforgeloop/shared'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { z } from 'zod'
import { errorMessage } from '../../errors.ts'
import type { ToolOutcome } from './registry.ts'

export type McpClient = {
  listTools(): Promise<ToolDescriptor[]>
  /** Never throws: a failed or timed-out call comes back as an isError outcome. */
  callTool(name: string, input: unknown, signal: AbortSignal): Promise<ToolOutcome>
  close(): Promise<void>
}

const LIST_TIMEOUT_MS = 10_000
const CALL_TIMEOUT_MS = 30_000

const CallInput = z.record(z.string(), z.unknown())

const transportFor = (config: McpConfig) => {
  if (config.transport === 'http') {
    if (!config.url) throw new Error('An HTTP connection needs a url')
    return new StreamableHTTPClientTransport(new URL(config.url))
  }
  if (!config.command) throw new Error('A stdio connection needs a command')
  // Only the SDK's default variables (PATH, HOME, ...) are inherited, not the app's secrets. The
  // connection's own env is spread last, so it wins over an inherited variable on purpose.
  return new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: { ...getDefaultEnvironment(), ...config.env },
  })
}

/**
 * One MCP server. Connects on first use. A failed connect, or a lost connection (the process exited,
 * the HTTP session dropped), is forgotten so the next call reconnects.
 */
export const createMcpClient = (config: McpConfig): McpClient => {
  let connecting: Promise<Client> | undefined

  const connect = (): Promise<Client> => {
    if (connecting) return connecting
    const attempt: Promise<Client> = (async () => {
      const client = new Client({ name: 'agentforgeloop', version: '0.1.0' })
      await client.connect(transportFor(config), { timeout: LIST_TIMEOUT_MS })
      client.onclose = () => {
        if (connecting === attempt) connecting = undefined
      }
      return client
    })().catch((err: unknown) => {
      if (connecting === attempt) connecting = undefined
      throw err
    })
    connecting = attempt
    return attempt
  }

  return {
    listTools: async () => {
      const client = await connect()
      const { tools } = await client.listTools(undefined, { timeout: LIST_TIMEOUT_MS })
      return ToolDescriptor.array().parse(tools)
    },

    callTool: async (name, input, signal) => {
      try {
        const client = await connect()
        const result = await client.callTool(
          { name, arguments: CallInput.parse(input) },
          undefined,
          {
            timeout: CALL_TIMEOUT_MS,
            signal,
          },
        )
        return {
          output: result.structuredContent ?? result.content,
          isError: result.isError === true,
        }
      } catch (err) {
        return { output: errorMessage(err), isError: true }
      }
    },

    close: async () => {
      const pending = connecting
      connecting = undefined
      if (!pending) return
      try {
        await (await pending).close()
      } catch {
        // The server was already gone or never connected.
      }
    },
  }
}
