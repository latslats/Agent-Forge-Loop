import type Anthropic from '@anthropic-ai/sdk'
import {
  BUILTIN_CONNECTION_ID,
  type Connection,
  type McpConfig,
  type ToolDescriptor as ToolInfo,
  type ToolRef,
} from '@agentforgeloop/shared'
import { errorMessage } from '../../errors.ts'
import { builtinTools } from './builtin.ts'
import { createMcpClient, type McpClient } from './mcp.ts'
import type { ToolContext, ToolDef } from './types.ts'

export type ToolOutcome = { output: unknown; isError: boolean }

export type ToolDescriptor = { connectionId: string; tool: string; description: string }

/** The tools a connection's server offers, or why it could not be listed. */
export type ToolListing = { tools: ToolInfo[]; error: string | null }

export type ToolRegistry = {
  list(): ToolDescriptor[]
  /** Throws for an unknown ref, so a step fails with a clear message. */
  resolve(refs: ToolRef[]): Array<{ ref: ToolRef; tool: Anthropic.Tool }>
  /** Never throws: unknown tools and thrown errors come back as isError results. */
  call(ref: ToolRef, input: unknown, signal: AbortSignal, ctx?: ToolContext): Promise<ToolOutcome>
  /** Lists the tools of a server before it is saved. Throws when the server cannot be listed. */
  probe(config: McpConfig): Promise<ToolInfo[]>
  /** The tools of a connection. An MCP server is listed the first time, then read from the cache. Never throws. */
  listing(connectionId: string): Promise<ToolListing>
  /** Lists an MCP connection again now, closing its old client. Forgets it when it is gone. Never throws. */
  refresh(connectionId?: string): Promise<void>
  close(): Promise<void>
}

type McpEntry = { client: McpClient; tools: ToolInfo[]; defs: ToolDef[]; error: string | null }
type McpConnection = Connection & { config: McpConfig }

/** The name the model sees. Double underscore keeps it unique and valid. */
export const toolName = (ref: ToolRef): string => `${ref.connectionId}__${ref.tool}`

const isMcp = (connection: Connection): connection is McpConnection =>
  connection.kind === 'mcp' && connection.config !== null

const findIn = (defs: ToolDef[], ref: ToolRef): ToolDef | undefined =>
  defs.find((def) => def.connectionId === ref.connectionId && def.name === ref.tool)

const mcpDef = (connectionId: string, client: McpClient, tool: ToolInfo): ToolDef => ({
  connectionId,
  name: tool.name,
  description: tool.description,
  inputSchema: { ...tool.inputSchema, type: 'object' },
  run: (input, signal) => client.callTool(tool.name, input, signal),
})

/**
 * `defs` are the built-in tools. `loadConnections` is read on every call, so the enabled tools of
 * MCP connections are always current. `createClient` is injected by tests.
 */
export const createToolRegistry = (
  defs: ToolDef[] = builtinTools,
  loadConnections: () => Connection[] = () => [],
  createClient: (config: McpConfig) => McpClient = createMcpClient,
): ToolRegistry => {
  const entries = new Map<string, McpEntry>()
  const loading = new Map<string, Promise<void>>()

  const mcpConnections = (): McpConnection[] => loadConnections().filter(isMcp)

  // Lists one MCP connection and stores the result, or the error. Never throws. A listing waits for
  // one already running for the same connection, so each client is closed by the listing that replaces it.
  const relist = (connectionId: string): Promise<void> => {
    const job: Promise<void> = (loading.get(connectionId) ?? Promise.resolve())
      .then(async () => {
        const connection = mcpConnections().find((c) => c.id === connectionId)
        const old = entries.get(connectionId)
        entries.delete(connectionId)
        await old?.client.close()
        if (!connection) return
        const client = createClient(connection.config)
        try {
          const tools = await client.listTools()
          const defsOfTools = tools.map((tool) => mcpDef(connectionId, client, tool))
          entries.set(connectionId, { client, tools, defs: defsOfTools, error: null })
        } catch (err) {
          await client.close()
          entries.set(connectionId, { client, tools: [], defs: [], error: errorMessage(err) })
        }
      })
      .finally(() => {
        if (loading.get(connectionId) === job) loading.delete(connectionId)
      })
    loading.set(connectionId, job)
    return job
  }

  // Starts listing MCP connections the registry has never listed. Does not wait for them.
  const ensureListed = (connections: McpConnection[]): void => {
    for (const connection of connections) {
      if (!entries.has(connection.id) && !loading.has(connection.id)) void relist(connection.id)
    }
  }

  const enabledMcpDefs = (): ToolDef[] => {
    const connections = mcpConnections()
    ensureListed(connections)
    return connections.flatMap((connection) => {
      const entry = entries.get(connection.id)
      if (!entry) return []
      return entry.defs.filter((def) => connection.enabledTools.includes(def.name))
    })
  }

  const allDefs = (): ToolDef[] => [...defs, ...enabledMcpDefs()]

  return {
    list: () =>
      allDefs().map((def) => ({
        connectionId: def.connectionId,
        tool: def.name,
        description: def.description,
      })),

    resolve: (refs) => {
      const current = allDefs()
      return refs.map((ref) => {
        const def = findIn(current, ref)
        if (!def) throw new Error(`Unknown tool "${ref.connectionId}/${ref.tool}"`)
        return {
          ref,
          tool: {
            name: toolName(ref),
            description: def.description,
            input_schema: def.inputSchema,
            // Strict mode needs schemas we write ourselves; MCP servers' schemas are often not strict-compatible.
            strict: def.connectionId === BUILTIN_CONNECTION_ID,
          },
        }
      })
    },

    call: async (ref, input, signal, ctx) => {
      const def = findIn(allDefs(), ref)
      if (!def) return { output: `Unknown tool ${ref.connectionId}/${ref.tool}`, isError: true }
      try {
        return await def.run(input, signal, ctx)
      } catch (err) {
        return { output: errorMessage(err), isError: true }
      }
    },

    probe: async (config) => {
      const client = createClient(config)
      try {
        return await client.listTools()
      } finally {
        await client.close()
      }
    },

    listing: async (connectionId) => {
      if (connectionId === BUILTIN_CONNECTION_ID) {
        const tools = defs.map((def) => ({
          name: def.name,
          description: def.description,
          inputSchema: def.inputSchema,
        }))
        return { tools, error: null }
      }
      if (!entries.has(connectionId)) await (loading.get(connectionId) ?? relist(connectionId))
      const entry = entries.get(connectionId)
      return { tools: entry?.tools ?? [], error: entry?.error ?? null }
    },

    refresh: async (connectionId) => {
      const ids = connectionId
        ? [connectionId]
        : [...new Set([...entries.keys(), ...mcpConnections().map((c) => c.id)])]
      await Promise.all(ids.map((id) => relist(id)))
    },

    close: async () => {
      const open = [...entries.values()]
      entries.clear()
      await Promise.all(open.map((entry) => entry.client.close()))
    },
  }
}
