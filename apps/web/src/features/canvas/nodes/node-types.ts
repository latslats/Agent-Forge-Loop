import type { NodeTypes } from '@xyflow/react'
import { AiNode } from './ai-node.tsx'
import { ApprovalNode } from './approval-node.tsx'
import { BranchNode } from './branch-node.tsx'
import { CheckNode } from './check-node.tsx'
import { CodeNode } from './code-node.tsx'
import { OutputNode } from './output-node.tsx'
import { TriggerNode } from './trigger-node.tsx'

/** Registered once at module level so React Flow never sees a new object between renders. */
export const nodeTypes = {
  trigger: TriggerNode,
  ai: AiNode,
  code: CodeNode,
  check: CheckNode,
  approval: ApprovalNode,
  branch: BranchNode,
  output: OutputNode,
} satisfies NodeTypes
