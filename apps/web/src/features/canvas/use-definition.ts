import {
  type Agent,
  type AgentDefinition,
  ApiError as ApiErrorBody,
  type Node as DefNode,
  type NodeType,
} from '@agentforgeloop/shared'
import type { Connection, EdgeChange, NodeChange, XYPosition } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { ApiError, useUpdateAgent } from '../../api/client.ts'
import {
  connectNodes,
  createNode,
  type FlowNode,
  getProblems,
  moveNodes,
  removeElements,
  replaceNode,
  type Selection,
  type Sizes,
  toFlowEdges,
  toFlowNodes,
  updateSelection,
} from './definition-graph.ts'
import { useDebouncedSave } from './use-debounced-save.ts'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'invalid'

const Detail = z.union([
  z.string(),
  z.object({ message: z.string(), path: z.array(z.unknown()).optional() }),
])

/** One line per problem from a 400 response: the server's list of strings or zod issues. */
function describeDetail(item: unknown): string {
  const parsed = Detail.safeParse(item)
  if (!parsed.success) return 'The draft is invalid.'
  if (typeof parsed.data === 'string') return parsed.data
  const path = parsed.data.path?.map(String).join('.')
  return path ? `${path}: ${parsed.data.message}` : parsed.data.message
}

export function problemsFromError(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.status !== 400) return []
  const body = ApiErrorBody.safeParse(error.body)
  const details = z.array(z.unknown()).safeParse(body.success ? body.data.details : undefined)
  return details.success ? details.data.map(describeDetail) : []
}

/**
 * The draft is the single source of truth. The canvas and the settings form both edit it;
 * every change schedules one autosave. Remount the hook (a `key`) to reset it for another agent.
 */
export function useDefinition(agent: Agent) {
  const [initial] = useState(agent.draft)
  const [definition, setDefinition] = useState(agent.draft)
  const [selection, setSelection] = useState<Selection>({ nodes: [], edges: [] })
  const [sizes, setSizes] = useState<Sizes>({})
  const [dirty, setDirty] = useState(false)
  const save = useUpdateAgent(agent.id)

  const scheduleSave = useDebouncedSave((next: AgentDefinition) => {
    setDirty(false)
    if (getProblems(next).length === 0) save.mutate({ draft: next })
  }, 500)

  useEffect(() => {
    if (definition === initial) return
    setDirty(true)
    scheduleSave(definition)
  }, [definition, initial, scheduleSave])

  const problems = useMemo(() => getProblems(definition), [definition])
  const serverProblems = save.error ? problemsFromError(save.error) : []
  const problemList = problems.length > 0 ? problems : serverProblems
  const status: SaveStatus =
    problems.length > 0
      ? 'invalid'
      : save.isError
        ? 'error'
        : dirty || save.isPending
          ? 'saving'
          : save.isSuccess
            ? 'saved'
            : 'idle'

  const flowNodes = useMemo(
    () => toFlowNodes(definition, selection.nodes, sizes),
    [definition, selection.nodes, sizes],
  )
  const flowEdges = useMemo(
    () => toFlowEdges(definition, selection.edges),
    [definition, selection.edges],
  )

  const selectedId = selection.nodes.length === 1 ? selection.nodes[0] : undefined
  const selectedNode = definition.nodes.find((node) => node.id === selectedId) ?? null
  const hasTrigger = definition.nodes.some((node) => node.type === 'trigger')

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    const moved = new Map<string, XYPosition>()
    const removed = new Set<string>()
    const picked = new Map<string, boolean>()
    const measured: Sizes = {}
    for (const change of changes) {
      if (change.type === 'position' && change.position) moved.set(change.id, change.position)
      else if (change.type === 'remove') removed.add(change.id)
      else if (change.type === 'select') picked.set(change.id, change.selected)
      else if (change.type === 'dimensions' && change.dimensions)
        measured[change.id] = change.dimensions
    }
    if (moved.size > 0 || removed.size > 0) {
      setDefinition((prev) => removeElements(moveNodes(prev, moved), removed, new Set()))
    }
    if (picked.size > 0 || removed.size > 0) {
      setSelection((prev) => ({
        ...prev,
        nodes: updateSelection(prev.nodes, picked, removed),
      }))
    }
    if (Object.keys(measured).length > 0) setSizes((prev) => ({ ...prev, ...measured }))
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removed = new Set<string>()
    const picked = new Map<string, boolean>()
    for (const change of changes) {
      if (change.type === 'remove') removed.add(change.id)
      else if (change.type === 'select') picked.set(change.id, change.selected)
    }
    if (removed.size > 0) {
      setDefinition((prev) => removeElements(prev, new Set(), removed))
    }
    if (picked.size > 0 || removed.size > 0) {
      setSelection((prev) => ({
        ...prev,
        edges: updateSelection(prev.edges, picked, removed),
      }))
    }
  }, [])

  const onConnect = useCallback((connection: Connection) => {
    setDefinition((prev) =>
      connectNodes(prev, connection.source, connection.target, connection.sourceHandle),
    )
  }, [])

  /** Adds a node at `position`, or after the last node. A second trigger is refused. */
  const addNode = (type: NodeType, position?: XYPosition) => {
    if (type === 'trigger' && hasTrigger) return
    const last = definition.nodes.at(-1)
    const at =
      position ?? (last ? { x: last.position.x + 280, y: last.position.y } : { x: 80, y: 200 })
    const node = createNode(type, at)
    setDefinition((prev) => ({ ...prev, nodes: [...prev.nodes, node] }))
    setSelection({ nodes: [node.id], edges: [] })
  }

  const updateNode = useCallback((node: DefNode) => {
    setDefinition((prev) => replaceNode(prev, node))
  }, [])

  const updateAgent = useCallback((patch: Partial<AgentDefinition>) => {
    setDefinition((prev) => ({ ...prev, ...patch }))
  }, [])

  const deleteSelected = () => {
    setDefinition((prev) =>
      removeElements(prev, new Set(selection.nodes), new Set(selection.edges)),
    )
    setSelection({ nodes: [], edges: [] })
  }

  return {
    definition,
    problemList,
    status,
    hasTrigger,
    selectedNode,
    flowNodes,
    flowEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    updateNode,
    updateAgent,
    deleteSelected,
  }
}

export type DefinitionEditor = ReturnType<typeof useDefinition>
