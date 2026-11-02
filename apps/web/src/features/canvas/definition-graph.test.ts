import { type AgentDefinition, defaultDefinition, Node, type NodeType } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import {
  connectNodes,
  createNode,
  getProblems,
  removeElements,
  replaceNode,
  updateSelection,
} from './definition-graph.ts'

const NODE_TYPES: NodeType[] = ['trigger', 'ai', 'code', 'check', 'approval', 'branch', 'output']
const at = { x: 0, y: 0 }

describe('createNode', () => {
  it.each(NODE_TYPES)('creates a schema-valid %s node', (type) => {
    expect(Node.safeParse(createNode(type, at)).success).toBe(true)
  })
})

describe('getProblems', () => {
  it('flags a node whose only incoming edge was replaced', () => {
    const def: AgentDefinition = {
      ...defaultDefinition('Test'),
      nodes: [
        { id: 'trigger', type: 'trigger', label: 'Trigger', position: at },
        {
          id: 'ai',
          type: 'ai',
          label: 'Classify',
          prompt: 'x',
          tools: [],
          maxTurns: 8,
          position: at,
        },
        { id: 'code', type: 'code', label: 'Code', source: 'return prev', position: at },
        { id: 'out', type: 'output', label: 'Out', template: '', position: at },
      ],
      edges: [
        { id: 'e1', from: 'trigger', to: 'code' },
        { id: 'e2', from: 'ai', to: 'out' },
        { id: 'e3', from: 'code', to: 'out' },
      ],
    }
    expect(getProblems(def)).toEqual(['Node "ai" has no incoming edge'])
  })

  it('accepts a graph where every node after the trigger has an incoming edge', () => {
    const def: AgentDefinition = {
      ...defaultDefinition('Test'),
      nodes: [
        { id: 'trigger', type: 'trigger', label: 'Trigger', position: at },
        { id: 'out', type: 'output', label: 'Out', template: '', position: at },
      ],
      edges: [{ id: 'e1', from: 'trigger', to: 'out' }],
    }
    expect(getProblems(def)).toEqual([])
  })
})

describe('connectNodes', () => {
  it('labels the edge from a branch handle and replaces the old edge on that handle', () => {
    const base: AgentDefinition = {
      ...defaultDefinition('Test'),
      nodes: [
        { id: 'trigger', type: 'trigger', label: 'Trigger', position: at },
        {
          id: 'pick',
          type: 'branch',
          label: 'Pick',
          expression: 'true',
          position: at,
        },
        { id: 'a', type: 'output', label: 'A', template: '', position: at },
        { id: 'b', type: 'output', label: 'B', template: '', position: at },
      ],
      edges: [
        { id: 'e1', from: 'trigger', to: 'pick' },
        { id: 'e2', from: 'pick', to: 'a', label: 'true' },
      ],
    }
    const next = connectNodes(base, 'pick', 'b', 'true')
    const fromPick = next.edges.filter((edge) => edge.from === 'pick')
    expect(fromPick).toHaveLength(1)
    expect(fromPick[0]).toMatchObject({ to: 'b', label: 'true' })
  })

  it('ignores self connections', () => {
    const def = defaultDefinition('Test')
    expect(connectNodes(def, 'step-1', 'step-1', null)).toBe(def)
  })
})

describe('replaceNode and removeElements', () => {
  it('drops the fail edge when a check stops instead of routing', () => {
    const def: AgentDefinition = {
      ...defaultDefinition('Test'),
      nodes: [
        { id: 'trigger', type: 'trigger', label: 'Trigger', position: at },
        {
          id: 'check',
          type: 'check',
          label: 'Check',
          check: { kind: 'cost_cap', maxUsd: 1 },
          onFail: 'route',
          position: at,
        },
        { id: 'out', type: 'output', label: 'Out', template: '', position: at },
      ],
      edges: [
        { id: 'e1', from: 'trigger', to: 'check' },
        { id: 'e2', from: 'check', to: 'out', label: 'fail' },
      ],
    }
    const node = def.nodes[1]
    if (node?.type !== 'check') throw new Error('expected a check node')
    const next = replaceNode(def, { ...node, onFail: 'stop' })
    expect(next.edges.map((edge) => edge.id)).toEqual(['e1'])
  })

  it('removes the edges that touch a deleted node', () => {
    const def = defaultDefinition('Test')
    const next = removeElements(def, new Set(['step-1']), new Set())
    expect(next.nodes.map((node) => node.id)).toEqual(['trigger', 'output'])
    expect(next.edges).toEqual([])
  })
})

describe('getProblems', () => {
  it('is empty for a valid draft and reports a missing trigger', () => {
    expect(getProblems(defaultDefinition('Test'))).toEqual([])
    const noTrigger = { ...defaultDefinition('Test'), nodes: [] }
    expect(getProblems(noTrigger)).toContain('Expected exactly one trigger node, found 0')
  })
})

describe('updateSelection', () => {
  it('adds picked ids and drops removed ones', () => {
    const picked = new Map([
      ['a', true],
      ['b', false],
    ])
    expect(updateSelection(['b', 'c'], picked, new Set(['c']))).toEqual(['a'])
  })
})
