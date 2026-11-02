import type Anthropic from '@anthropic-ai/sdk'
import type { Db } from '../../db/sqlite.ts'
import type { ToolOutcome } from './registry.ts'

/** Per-call context from the AI step. Only tools that touch the run or its agent (memory) read it. */
export type ToolContext = { db: Db; agentId: string; runId: string }

/** A tool the engine can run. Built-in and, later, MCP tools share this shape. */
export type ToolDef = {
  connectionId: string
  name: string
  description: string
  inputSchema: Anthropic.Tool.InputSchema
  run: (input: unknown, signal: AbortSignal, ctx?: ToolContext) => Promise<ToolOutcome>
}
