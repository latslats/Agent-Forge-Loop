import type { NodeProps } from '@xyflow/react'
import type { FlowNode } from '../definition-graph.ts'
import { NodeCard } from './node-card.tsx'

export function OutputNode({ data, selected }: NodeProps<FlowNode>) {
  return <NodeCard data={data} selected={selected} input outputs={[]} />
}
