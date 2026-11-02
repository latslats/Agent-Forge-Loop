import type { NodeProps } from '@xyflow/react'
import type { FlowNode } from '../definition-graph.ts'
import { NodeCard, type OutputHandle } from './node-card.tsx'

const OUTPUTS: OutputHandle[] = [
  { id: 'true', label: 'true', tone: 'ok' },
  { id: 'false', label: 'false', tone: 'fail' },
]

export function BranchNode({ data, selected }: NodeProps<FlowNode>) {
  return <NodeCard data={data} selected={selected} input outputs={OUTPUTS} />
}
