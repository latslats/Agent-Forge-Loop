import type { CodeNode } from '@agentforgeloop/shared'
import { runCode } from '../sandbox.ts'
import type { NodeHandler } from '../types.ts'

export const runCodeNode: NodeHandler<CodeNode> = async (node, state) => ({
  type: 'next',
  prev: runCode(node.source, state),
})
