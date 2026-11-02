import type Anthropic from '@anthropic-ai/sdk'
import type { AiNode } from '@agentforgeloop/shared'
import { listMemories } from '../../db/memories.ts'
import { getRun } from '../../db/runs.ts'
import type { NodeHandler, NodeOutcome } from '../types.ts'

const fail = (error: string): NodeOutcome => ({ type: 'fail', error })

const MEMORY_FACTS_LIMIT = 20

const buildSystem = (
  node: AiNode,
  principles: string,
  agent: string,
  facts: string[],
): Anthropic.TextBlockParam[] => {
  const blocks: Anthropic.TextBlockParam[] = []
  if (principles)
    blocks.push({ type: 'text', text: principles, cache_control: { type: 'ephemeral' } })
  if (facts.length > 0)
    blocks.push({
      type: 'text',
      text: `Facts remembered from earlier runs:\n${facts.map((fact) => `- ${fact}`).join('\n')}`,
      cache_control: { type: 'ephemeral' },
    })
  if (node.prompt) blocks.push({ type: 'text', text: node.prompt })
  blocks.push({ type: 'text', text: agent })
  blocks.push({
    type: 'text',
    text: 'The run input and the previous step result are in the user message.',
  })
  return blocks
}

const textOf = (message: Anthropic.Message): string =>
  message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')

// A model answer that is JSON becomes the step result; anything else stays text.
const parseAnswer = (text: string): unknown => {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    return JSON.parse(unfenced)
  } catch {
    return text
  }
}

export const runAiNode: NodeHandler<AiNode> = async (node, state, io) => {
  const { definition, deps, emit, signal } = io
  const model = node.model ?? definition.model
  const effort = node.effort ?? definition.effort
  const resolved = deps.tools.resolve(node.tools.length > 0 ? node.tools : definition.tools)
  const refByName = new Map(resolved.map(({ ref, tool }) => [tool.name, ref]))
  const tools = resolved.map(({ tool }) => tool)
  const agentId = getRun(deps.db, io.runId).agentId
  const facts = definition.memory.enabled
    ? listMemories(deps.db, agentId, MEMORY_FACTS_LIMIT).map((memory) => memory.content)
    : []
  if (facts.length > 0) emit('log', node.id, { message: `Loaded ${facts.length} memories` })
  const system = buildSystem(
    node,
    definition.principles,
    `Agent: ${definition.name}. ${definition.description}`,
    facts,
  )
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: JSON.stringify({ input: state.input, prev: state.prev }) },
  ]

  for (let turn = 1; turn <= node.maxTurns; turn++) {
    const { message, usage, costUsd, durationMs } = await deps.llm.message({
      model,
      effort,
      system,
      messages,
      tools,
      signal,
    })
    state.costUsd += costUsd
    state.tokensIn += usage.inputTokens
    state.tokensOut += usage.outputTokens
    emit('model_call', node.id, {
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      costUsd,
      stopReason: message.stop_reason ?? 'none',
      durationMs,
    })

    if (message.stop_reason === 'max_tokens')
      return fail('The model reached max_tokens before the step finished')
    if (message.stop_reason === 'refusal') {
      const detail = message.stop_details?.explanation
      return fail(`The model refused this step${detail ? `: ${detail}` : ''}`)
    }
    if (message.stop_reason === 'end_turn')
      return { type: 'next', prev: parseAnswer(textOf(message)) }
    if (message.stop_reason !== 'tool_use')
      return fail(`Unexpected stop reason "${message.stop_reason ?? 'none'}"`)

    const uses = message.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )
    const results = await Promise.all(
      uses.map(async (use): Promise<Anthropic.ToolResultBlockParam> => {
        const ref = refByName.get(use.name)
        emit('tool_call', node.id, { tool: use.name, input: use.input })
        const started = Date.now()
        const outcome = ref
          ? await deps.tools.call(ref, use.input, signal, {
              db: deps.db,
              agentId,
              runId: io.runId,
            })
          : { output: `Unknown tool ${use.name}`, isError: true }
        emit('tool_result', node.id, {
          tool: use.name,
          output: outcome.output,
          isError: outcome.isError,
          durationMs: Date.now() - started,
        })
        if (!state.toolsUsed.includes(use.name)) state.toolsUsed.push(use.name)
        return {
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(outcome.output) ?? '',
          is_error: outcome.isError,
        }
      }),
    )
    messages.push({ role: 'assistant', content: message.content })
    messages.push({ role: 'user', content: results })
  }

  return fail(`The agent was still calling tools after ${node.maxTurns} turns`)
}
