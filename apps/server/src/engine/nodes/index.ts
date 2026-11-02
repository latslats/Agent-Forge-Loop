import type { Node } from '@agentforgeloop/shared'
import type { NodeIo, NodeOutcome, RunState } from '../types.ts'
import { runAiNode } from './ai.ts'
import { runApprovalNode } from './approval.ts'
import { runBranchNode } from './branch.ts'
import { runCheckNode } from './check.ts'
import { runCodeNode } from './code.ts'
import { runOutputNode } from './output.ts'

/** Trigger has no work of its own; it only starts the walk. */
export const runNode = (node: Node, state: RunState, io: NodeIo): Promise<NodeOutcome> => {
  switch (node.type) {
    case 'trigger':
      return Promise.resolve({ type: 'next' })
    case 'ai':
      return runAiNode(node, state, io)
    case 'code':
      return runCodeNode(node, state, io)
    case 'check':
      return runCheckNode(node, state, io)
    case 'approval':
      return runApprovalNode(node, state, io)
    case 'branch':
      return runBranchNode(node, state, io)
    case 'output':
      return runOutputNode(node, state, io)
  }
}
