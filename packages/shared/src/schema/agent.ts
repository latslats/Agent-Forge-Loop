import { z } from 'zod'
import { DEFAULT_EFFORT, DEFAULT_MODEL, EdgeLabel, Effort, Id, IsoDate, ModelId } from './common.ts'

export const Position = z.object({ x: z.number(), y: z.number() })
export type Position = z.infer<typeof Position>

const nodeBase = { id: Id, label: z.string().min(1), position: Position }

export const TriggerNode = z.object({ ...nodeBase, type: z.literal('trigger') })
export type TriggerNode = z.infer<typeof TriggerNode>

export const ToolRef = z.object({ connectionId: Id, tool: z.string() })
export type ToolRef = z.infer<typeof ToolRef>

export const AiNode = z.object({
  ...nodeBase,
  type: z.literal('ai'),
  prompt: z.string(),
  model: ModelId.optional(),
  effort: Effort.optional(),
  tools: z.array(ToolRef).default([]),
  maxTurns: z.number().int().min(1).max(50).default(8),
})
export type AiNode = z.infer<typeof AiNode>

/** JS run in node:vm with { input, vars, prev }; the return value becomes prev. */
export const CodeNode = z.object({ ...nodeBase, type: z.literal('code'), source: z.string() })
export type CodeNode = z.infer<typeof CodeNode>

const CheckTarget = z.enum(['input', 'output'])

export const CheckConfig = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('regex'),
    pattern: z.string(),
    flags: z.string().default(''),
    mode: z.enum(['block', 'require']),
    target: CheckTarget,
  }),
  z.object({
    kind: z.literal('json_schema'),
    schema: z.record(z.string(), z.unknown()),
    target: CheckTarget,
  }),
  z.object({ kind: z.literal('llm_judge'), rubric: z.string(), target: CheckTarget }),
  z.object({ kind: z.literal('cost_cap'), maxUsd: z.number().positive() }),
  z.object({ kind: z.literal('tool_allowlist'), tools: z.array(z.string()) }),
])
export type CheckConfig = z.infer<typeof CheckConfig>

export const CheckNode = z.object({
  ...nodeBase,
  type: z.literal('check'),
  check: CheckConfig,
  onFail: z.enum(['stop', 'route']).default('stop'),
})
export type CheckNode = z.infer<typeof CheckNode>

export const ApprovalNode = z.object({
  ...nodeBase,
  type: z.literal('approval'),
  message: z.string(),
  timeoutMinutes: z.number().int().positive().optional(),
  onTimeout: z.enum(['fail', 'approve']).default('fail'),
})
export type ApprovalNode = z.infer<typeof ApprovalNode>

/** JS boolean expression over { input, vars, prev }; follows the 'true' or 'false' edge. */
export const BranchNode = z.object({
  ...nodeBase,
  type: z.literal('branch'),
  expression: z.string(),
})
export type BranchNode = z.infer<typeof BranchNode>

/** Empty template passes prev through unchanged. */
export const OutputNode = z.object({
  ...nodeBase,
  type: z.literal('output'),
  template: z.string().default(''),
})
export type OutputNode = z.infer<typeof OutputNode>

export const Node = z.discriminatedUnion('type', [
  TriggerNode,
  AiNode,
  CodeNode,
  CheckNode,
  ApprovalNode,
  BranchNode,
  OutputNode,
])
export type Node = z.infer<typeof Node>

export const NODE_TYPES = [
  'trigger',
  'ai',
  'code',
  'check',
  'approval',
  'branch',
  'output',
] as const
export const NodeType = z.enum(NODE_TYPES)
export type NodeType = z.infer<typeof NodeType>

export const Edge = z.object({ id: Id, from: Id, to: Id, label: EdgeLabel.optional() })
export type Edge = z.infer<typeof Edge>

export const AgentDefinition = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  model: ModelId.default(DEFAULT_MODEL),
  effort: Effort.default(DEFAULT_EFFORT),
  principles: z.string().default(''),
  memory: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
  tools: z.array(ToolRef).default([]),
  nodes: z.array(Node),
  edges: z.array(Edge),
})
export type AgentDefinition = z.infer<typeof AgentDefinition>
export type AgentDefinitionInput = z.input<typeof AgentDefinition>

export const AgentStatus = z.enum(['draft', 'active', 'paused'])
export type AgentStatus = z.infer<typeof AgentStatus>

export const Agent = z.object({
  id: Id,
  name: z.string(),
  description: z.string(),
  status: AgentStatus,
  currentVersion: z.number().int().nullable(),
  draft: AgentDefinition,
  createdAt: IsoDate,
  updatedAt: IsoDate,
})
export type Agent = z.infer<typeof Agent>

export const AgentVersion = z.object({
  id: Id,
  agentId: Id,
  number: z.number().int(),
  definition: AgentDefinition,
  note: z.string(),
  createdAt: IsoDate,
})
export type AgentVersion = z.infer<typeof AgentVersion>

/** Graph-level problems the zod schema cannot express. Empty array means valid. */
export const validateDefinition = (def: AgentDefinition): string[] => {
  const problems: string[] = []
  const ids = new Set<string>()
  for (const node of def.nodes) {
    if (ids.has(node.id)) problems.push(`Duplicate node id "${node.id}"`)
    ids.add(node.id)
  }

  const triggers = def.nodes.filter((n) => n.type === 'trigger').length
  if (triggers !== 1) problems.push(`Expected exactly one trigger node, found ${triggers}`)
  if (!def.nodes.some((n) => n.type === 'output'))
    problems.push('At least one output node is required')

  for (const edge of def.edges) {
    if (!ids.has(edge.from))
      problems.push(`Edge "${edge.id}" starts at unknown node "${edge.from}"`)
    if (!ids.has(edge.to)) problems.push(`Edge "${edge.id}" ends at unknown node "${edge.to}"`)
  }

  const targets = new Set(def.edges.map((e) => e.to))
  for (const node of def.nodes) {
    if (node.type !== 'trigger' && !targets.has(node.id))
      problems.push(`Node "${node.id}" has no incoming edge`)
    const outgoing = def.edges.filter((e) => e.from === node.id)
    const labels = new Set(outgoing.map((e) => e.label))
    if (node.type === 'output') {
      if (outgoing.length > 0)
        problems.push(`Output node "${node.id}" must not have outgoing edges`)
      continue
    }
    if (outgoing.length === 0) problems.push(`Node "${node.id}" has no outgoing edge`)
    if (node.type === 'branch') {
      if (!labels.has('true')) problems.push(`Branch node "${node.id}" is missing a 'true' edge`)
      if (!labels.has('false')) problems.push(`Branch node "${node.id}" is missing a 'false' edge`)
    }
    if (node.type === 'check' && node.onFail === 'route' && !labels.has('fail')) {
      problems.push(`Check node "${node.id}" routes on failure but has no 'fail' edge`)
    }
  }
  return problems
}

export const defaultDefinition = (name: string): AgentDefinition =>
  AgentDefinition.parse({
    name,
    nodes: [
      { id: 'trigger', type: 'trigger', label: 'Trigger', position: { x: 80, y: 200 } },
      {
        id: 'step-1',
        type: 'ai',
        label: 'AI step',
        prompt: 'You are a helpful assistant. Respond to the input.',
        position: { x: 360, y: 200 },
      },
      { id: 'output', type: 'output', label: 'Output', position: { x: 640, y: 200 } },
    ],
    edges: [
      { id: 'e1', from: 'trigger', to: 'step-1' },
      { id: 'e2', from: 'step-1', to: 'output' },
    ],
  } satisfies AgentDefinitionInput)
