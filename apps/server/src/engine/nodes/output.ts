import type { OutputNode } from '@agentforgeloop/shared'
import { render } from '../template.ts'
import type { NodeHandler } from '../types.ts'

// The executor takes the output node's prev as the run output.
export const runOutputNode: NodeHandler<OutputNode> = async (node, state) => ({
  type: 'next',
  prev: node.template ? render(node.template, state) : state.prev,
})
