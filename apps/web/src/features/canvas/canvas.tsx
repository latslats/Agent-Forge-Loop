import {
  Background,
  BackgroundVariant,
  Controls,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { type NodeType, NodeType as NodeTypeSchema } from '@agentforgeloop/shared'
import { type DragEvent, useEffect, useMemo, useRef } from 'react'
import type { ActiveRun } from '../runs/active-run.ts'
import { useActiveRun } from '../runs/active-run.ts'
import type { FlowEdge, FlowNode, RunMark } from './definition-graph.ts'
import { NODE_DRAG_TYPE } from './node-info.ts'
import { nodeTypes } from './nodes/node-types.ts'

/** Where a node stands in the run the agent page is watching. */
function runMark(run: ActiveRun, id: string): RunMark {
  if (run.failedNodeId === id) return 'failed'
  if (run.runningNodeId === id) return 'running'
  return run.finishedNodeIds.includes(id) ? 'done' : null
}

/** The React Flow canvas. Must render inside a ReactFlowProvider. */
export function Canvas({
  agentId,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onAddNode,
}: {
  agentId: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  onNodesChange: OnNodesChange<FlowNode>
  onEdgesChange: OnEdgesChange<FlowEdge>
  onConnect: OnConnect
  onAddNode: (type: NodeType, position: { x: number; y: number }) => void
}) {
  const { screenToFlowPosition, fitView } = useReactFlow()
  const run = useActiveRun(agentId)
  const surface = useRef<HTMLDivElement>(null)
  const marked = useMemo(
    () => nodes.map((node) => ({ ...node, data: { ...node.data, run: runMark(run, node.id) } })),
    [nodes, run],
  )

  // The run drawer changes this box's height, so refit the graph whenever the box is resized.
  useEffect(() => {
    const element = surface.current
    if (!element) return
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      // Wait a frame so React Flow has measured the new size before fitting.
      frame = requestAnimationFrame(() => void fitView({ padding: 0.2 }))
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [fitView])

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const type = NodeTypeSchema.safeParse(event.dataTransfer.getData(NODE_DRAG_TYPE))
    if (!type.success) return
    onAddNode(type.data, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop target for palette drags; keyboard users add nodes from the palette buttons.
    <div
      ref={surface}
      className="canvas-surface absolute inset-0"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={marked}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        minZoom={0.3}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  )
}
