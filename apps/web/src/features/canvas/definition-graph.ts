import {
  AgentDefinition,
  type Node as DefNode,
  EdgeLabel,
  type NodeType,
  validateDefinition,
} from '@agentforgeloop/shared'
import type { Edge as FlowEdgeBase, Node as FlowNodeBase, XYPosition } from '@xyflow/react'
import { NODE_INFO } from './node-info.ts'

/** Live run state shown on a node card. */
export type RunMark = 'running' | 'done' | 'failed' | null
export type FlowNodeData = { def: DefNode; run: RunMark }
export type FlowNode = FlowNodeBase<FlowNodeData, NodeType>
export type FlowEdge = FlowEdgeBase
/** Measured node sizes, reported by React Flow and kept so handles keep their positions. */
export type Sizes = Record<string, { width: number; height: number }>
/** Ids of the selected nodes and edges. Selection is view state, not part of the draft. */
export type Selection = { nodes: string[]; edges: string[] }

const shortId = () => Math.random().toString(36).slice(2, 10)

const EDGE_STROKE: Record<EdgeLabel, string> = {
  true: 'var(--color-active)',
  pass: 'var(--color-active)',
  false: 'var(--color-danger)',
  fail: 'var(--color-danger)',
}

const describePath = (def: AgentDefinition, path: PropertyKey[]): string => {
  const [head, index] = path
  if (head === 'nodes' && typeof index === 'number') {
    const node = def.nodes[index]
    return node?.label ? `"${node.label}"` : 'An unnamed node'
  }
  return path.map(String).join('.') || 'Draft'
}

/** Everything that blocks saving: schema errors first, then graph rules. Empty means valid. */
export function getProblems(def: AgentDefinition): string[] {
  const parsed = AgentDefinition.safeParse(def)
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => `${describePath(def, issue.path)}: ${issue.message}`)
  }
  return validateDefinition(parsed.data)
}

/** A new node with the defaults each kind needs to pass the schema. */
export function createNode(type: NodeType, position: XYPosition): DefNode {
  const id = `${type}-${shortId()}`
  const label = NODE_INFO[type].label
  const at = { x: position.x, y: position.y }
  switch (type) {
    case 'trigger':
      return { id, type, label, position: at }
    case 'ai':
      return {
        id,
        type,
        label,
        position: at,
        prompt: 'Describe what this step should do.',
        tools: [],
        maxTurns: 8,
      }
    case 'code':
      return { id, type, label, position: at, source: 'return prev' }
    case 'check':
      return {
        id,
        type,
        label,
        position: at,
        check: { kind: 'regex', pattern: '', flags: 'i', mode: 'block', target: 'output' },
        onFail: 'stop',
      }
    case 'approval':
      return {
        id,
        type,
        label,
        position: at,
        message: 'Approve this step?',
        onTimeout: 'fail',
      }
    case 'branch':
      return { id, type, label, position: at, expression: 'true' }
    case 'output':
      return { id, type, label, position: at, template: '' }
  }
}

/**
 * Adds an edge. A source handle carries one edge, so an existing edge on the same handle is
 * replaced. Branch and check handles carry their label; other handles carry none.
 */
export function connectNodes(
  def: AgentDefinition,
  source: string,
  target: string,
  sourceHandle: string | null,
): AgentDefinition {
  if (source === target) return def
  const parsed = EdgeLabel.safeParse(sourceHandle)
  const label = parsed.success ? parsed.data : undefined
  const kept = def.edges.filter((edge) => edge.from !== source || edge.label !== label)
  return { ...def, edges: [...kept, { id: `e-${shortId()}`, from: source, to: target, label }] }
}

/** Swaps in an edited node. Switching a check to 'stop' drops its fail edge. */
export function replaceNode(def: AgentDefinition, node: DefNode): AgentDefinition {
  const dropFail = node.type === 'check' && node.onFail === 'stop'
  const edges = dropFail
    ? def.edges.filter((edge) => !(edge.from === node.id && edge.label === 'fail'))
    : def.edges
  return { ...def, nodes: def.nodes.map((n) => (n.id === node.id ? node : n)), edges }
}

export function moveNodes(def: AgentDefinition, positions: Map<string, XYPosition>) {
  const nodes = def.nodes.map((node) => {
    const at = positions.get(node.id)
    return at ? { ...node, position: { x: at.x, y: at.y } } : node
  })
  return { ...def, nodes }
}

/** Removes nodes, the edges that touch them, and the given edges. */
export function removeElements(
  def: AgentDefinition,
  nodeIds: Set<string>,
  edgeIds: Set<string>,
): AgentDefinition {
  return {
    ...def,
    nodes: def.nodes.filter((node) => !nodeIds.has(node.id)),
    edges: def.edges.filter(
      (edge) => !edgeIds.has(edge.id) && !nodeIds.has(edge.from) && !nodeIds.has(edge.to),
    ),
  }
}

/** Applies a batch of select and deselect changes to a list of selected ids. */
export function updateSelection(
  current: string[],
  picked: Map<string, boolean>,
  removed: Set<string>,
): string[] {
  const kept = current.filter((id) => !removed.has(id) && picked.get(id) !== false)
  const added = [...picked]
    .filter(([id, on]) => on && !kept.includes(id) && !removed.has(id))
    .map(([id]) => id)
  return [...kept, ...added]
}

export function toFlowNodes(def: AgentDefinition, selected: string[], sizes: Sizes): FlowNode[] {
  return def.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    selected: selected.includes(node.id),
    measured: sizes[node.id],
    data: { def: node, run: null },
  }))
}

export function toFlowEdges(def: AgentDefinition, selected: string[]): FlowEdge[] {
  return def.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    sourceHandle: edge.label ?? null,
    label: edge.label,
    selected: selected.includes(edge.id),
    style: edge.label ? { stroke: EDGE_STROKE[edge.label] } : undefined,
  }))
}
