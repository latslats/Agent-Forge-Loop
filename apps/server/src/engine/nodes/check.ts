import type { CheckNode } from '@agentforgeloop/shared'
import { runCheck } from '../checks.ts'
import type { NodeHandler } from '../types.ts'

export const runCheckNode: NodeHandler<CheckNode> = async (node, state, io) => {
  const result = await runCheck(node.check, state, { llm: io.deps.llm, signal: io.signal })
  if (result.judge) {
    // The judge is a model call like any other: it counts toward the run and shows as model_call.
    const { model, usage, costUsd, stopReason, durationMs } = result.judge
    state.costUsd += costUsd
    state.tokensIn += usage.inputTokens
    state.tokensOut += usage.outputTokens
    io.emit('model_call', node.id, {
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      costUsd,
      stopReason,
      durationMs,
    })
  }
  io.emit('check_result', node.id, {
    kind: node.check.kind,
    pass: result.pass,
    reason: result.reason,
  })
  if (result.pass) return { type: 'next', label: 'pass' }
  if (node.onFail === 'route') return { type: 'next', label: 'fail' }
  return { type: 'fail', error: `Check "${node.label}" failed: ${result.reason}` }
}
