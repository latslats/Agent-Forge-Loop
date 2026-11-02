import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AgentDefinition, defaultDefinition, validateDefinition } from './agent.ts'

const base = () => defaultDefinition('x')

describe('defaultDefinition', () => {
  it('parses and validates clean', () => {
    const def = AgentDefinition.parse(defaultDefinition('x'))
    expect(def.model).toBe('claude-sonnet-5-5')
    expect(validateDefinition(def)).toEqual([])
  })
})

describe('validateDefinition', () => {
  it('rejects two triggers', () => {
    const def = base()
    def.nodes.push({ id: 'trigger-2', type: 'trigger', label: 'T2', position: { x: 0, y: 0 } })
    def.edges.push({ id: 'e3', from: 'trigger-2', to: 'step-1' })
    expect(validateDefinition(def)).toContain('Expected exactly one trigger node, found 2')
  })

  it('rejects a dangling edge', () => {
    const def = base()
    def.edges.push({ id: 'e3', from: 'step-1', to: 'ghost' })
    expect(validateDefinition(def)).toContain('Edge "e3" ends at unknown node "ghost"')
  })

  it('rejects a branch missing its false edge', () => {
    const def = base()
    def.nodes.push({
      id: 'b',
      type: 'branch',
      label: 'B',
      expression: 'true',
      position: { x: 0, y: 0 },
    })
    def.edges.push(
      { id: 'e3', from: 'trigger', to: 'b' },
      { id: 'e4', from: 'b', to: 'output', label: 'true' },
    )
    expect(validateDefinition(def)).toContain('Branch node "b" is missing a \'false\' edge')
  })

  it('rejects a definition with no output', () => {
    const def = base()
    def.nodes = def.nodes.filter((n) => n.type !== 'output')
    def.edges = def.edges.filter((e) => e.to !== 'output')
    const problems = validateDefinition(def)
    expect(problems).toContain('At least one output node is required')
    expect(problems).toContain('Node "step-1" has no outgoing edge')
  })
})

describe('AgentDefinition', () => {
  it('converts to JSON Schema', () => {
    expect(() => z.toJSONSchema(AgentDefinition)).not.toThrow()
  })
})
