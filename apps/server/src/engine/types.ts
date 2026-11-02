import type { AgentDefinition, EdgeLabel, Node, RunEvent, RunEventKind } from '@agentforgeloop/shared'
import { z } from 'zod'
import type { Db } from '../db/sqlite.ts'
import type { RunBus } from './bus.ts'
import type { Llm } from './llm.ts'
import type { ToolRegistry } from './tools/registry.ts'

/** Persisted in runs.state_json after every node, so a run can resume. */
export const RunStateSchema = z.object({
  input: z.unknown(),
  vars: z.record(z.string(), z.unknown()),
  prev: z.unknown(),
  nodeId: z.string().nullable(),
  costUsd: z.number(),
  tokensIn: z.number(),
  tokensOut: z.number(),
  toolsUsed: z.array(z.string()),
})
export type RunState = z.infer<typeof RunStateSchema>

export type NodeOutcome =
  | { type: 'next'; label?: EdgeLabel; prev?: unknown }
  | { type: 'wait'; approvalId: string }
  | { type: 'fail'; error: string }

export type EngineDeps = {
  db: Db
  llm: Llm
  tools: ToolRegistry
  bus: RunBus
  /** The Anthropic key the draft endpoint uses. Read once, in index.ts. */
  apiKey?: string
}

export type NodeIo = {
  runId: string
  definition: AgentDefinition
  emit: (kind: RunEventKind, nodeId: string | null, payload: Record<string, unknown>) => RunEvent
  deps: EngineDeps
  signal: AbortSignal
}

export type NodeHandler<N extends Node> = (
  node: N,
  state: RunState,
  io: NodeIo,
) => Promise<NodeOutcome>
