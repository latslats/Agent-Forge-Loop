import type Anthropic from '@anthropic-ai/sdk'
import { type AgentDefinition, defaultDefinition } from '@agentforgeloop/shared'
import { createAgent, publishVersion } from '../db/agents.ts'
import type { Db } from '../db/sqlite.ts'
import { RunBus } from './bus.ts'
import type { Llm, MessageParams } from './llm.ts'
import { createToolRegistry } from './tools/registry.ts'
import type { EngineDeps } from './types.ts'

// Test-only helpers. Nothing in the app imports this file.

export const fakeMessage = (
  content: Anthropic.ContentBlock[],
  stopReason: Anthropic.StopReason,
): Anthropic.Message =>
  ({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  }) as unknown as Anthropic.Message

export const textMessage = (text: string): Anthropic.Message =>
  fakeMessage([{ type: 'text', text, citations: null }] as Anthropic.ContentBlock[], 'end_turn')

export const toolUseMessage = (
  uses: Array<{ id: string; name: string; input: unknown }>,
): Anthropic.Message =>
  fakeMessage(
    uses.map((use) => ({
      type: 'tool_use',
      id: use.id,
      name: use.name,
      input: use.input,
    })) as Anthropic.ContentBlock[],
    'tool_use',
  )

/** A fake Llm whose message() answers from `respond`. The judge always passes, at no cost. */
export const fakeLlm = (respond: (params: MessageParams) => Promise<Anthropic.Message>): Llm => ({
  message: async (params) => ({
    message: await respond(params),
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.001,
    durationMs: 1,
  }),
  judge: async () => ({
    verdict: { pass: true, reason: 'fake judge' },
    model: 'claude-haiku-5-5',
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0,
    stopReason: 'end_turn',
    durationMs: 1,
  }),
})

/** Engine deps with an in-memory bus and the built-in tools. */
export const testEngine = (db: Db, llm: Llm): EngineDeps => ({
  db,
  llm,
  tools: createToolRegistry(),
  bus: new RunBus(),
})

/** Creates an agent whose version 1 is `definition`. Returns the agent id. */
export const publishAgent = (db: Db, definition: AgentDefinition): string => {
  const agent = createAgent(db, { name: definition.name, description: '', draft: definition })
  publishVersion(db, agent.id, 'test')
  return agent.id
}

/** The default trigger, AI step and output graph. */
export const defaultAgentDefinition = (name = 'Test agent'): AgentDefinition =>
  defaultDefinition(name)

/** Polls until `check` is true. Fails after `timeoutMs`. */
export const waitFor = async (check: () => boolean, timeoutMs = 3000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
