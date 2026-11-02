import type { BranchNode } from '@agentforgeloop/shared'
import { evalExpression } from '../sandbox.ts'
import type { NodeHandler } from '../types.ts'

export const runBranchNode: NodeHandler<BranchNode> = async (node, state) => ({
  type: 'next',
  label: evalExpression(node.expression, state) ? 'true' : 'false',
})
