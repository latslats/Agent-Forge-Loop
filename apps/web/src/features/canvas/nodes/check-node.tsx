import type { NodeProps } from '@xyflow/react'
import type { FlowNode } from '../definition-graph.ts'
import { NodeCard, type OutputHandle } from './node-card.tsx'

const PASS: OutputHandle = { id: 'pass', label: 'pass', tone: 'ok' }
const FAIL: OutputHandle = { id: 'fail', label: 'fail', tone: 'fail' }

export function CheckNode({ data, selected }: NodeProps<FlowNode>) {
  const routes = data.def.type === 'check' && data.def.onFail === 'route'
  return <NodeCard data={data} selected={selected} input outputs={routes ? [PASS, FAIL] : [PASS]} />
}
