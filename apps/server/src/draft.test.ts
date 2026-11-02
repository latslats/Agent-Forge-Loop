import { DraftAgentResponse, validateDefinition } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { autoLayout, type DraftModelCall, draftAgent } from './draft.ts'
import { getTemplate } from './templates.ts'

const good = () => structuredClone(getTemplate('support-email-triage').definition)

// Replies are objects (stringified here) or raw text. Each call is recorded for assertions.
const fakeModel = (...replies: unknown[]) => {
  const calls: Parameters<DraftModelCall>[0][] = []
  const call: DraftModelCall = async (params) => {
    calls.push(params)
    const reply = replies.shift()
    if (reply === undefined) throw new Error('no reply left')
    return typeof reply === 'string' ? reply : JSON.stringify(reply)
  }
  return { call, calls }
}

describe('autoLayout', () => {
  it('places nodes by depth from the trigger and by row within each depth', () => {
    const laid = autoLayout(good())
    const at = (id: string) => laid.nodes.find((node) => node.id === id)?.position
    expect(at('trigger')).toEqual({ x: 80, y: 200 })
    expect(at('classify')).toEqual({ x: 360, y: 200 })
    expect(at('pii')).toEqual({ x: 640, y: 200 })
    expect(at('review')).toEqual({ x: 920, y: 200 })
    expect(at('blocked')).toEqual({ x: 920, y: 380 })
    expect(at('send')).toEqual({ x: 1200, y: 200 })
  })

  it('keeps the graph valid and puts unreachable nodes in one extra column', () => {
    const def = good()
    const laid = autoLayout({
      ...def,
      nodes: [
        ...def.nodes,
        { id: 'loose', type: 'output', label: 'Loose', template: '', position: { x: 0, y: 0 } },
      ],
    })
    expect(laid.nodes.find((node) => node.id === 'loose')?.position).toEqual({ x: 1480, y: 200 })
    expect(validateDefinition(laid)).toEqual(['Node "loose" has no incoming edge'])
  })
})

describe('draftAgent', () => {
  it('returns the parsed draft with the chosen model and a layout, and no problems', async () => {
    const def = { ...good(), model: 'claude-sonnet-5-5', nodes: good().nodes }
    const { call, calls } = fakeModel(def)

    const result = await draftAgent(
      { description: 'Triage inbound support emails', model: 'claude-haiku-5-5' },
      call,
    )

    expect(result.problems).toEqual([])
    expect(result.definition.model).toBe('claude-haiku-5-5')
    expect(result.definition.nodes.find((n) => n.id === 'send')?.position.x).toBe(1200)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.model).toBe('claude-haiku-5-5')
    expect(calls[0]?.system).toContain('"nodes"')
    expect(DraftAgentResponse.parse(result)).toBeDefined()
  })

  it('sets every AI step to the chosen model, not the model the reply gave the step', async () => {
    const base = good()
    const nodes = base.nodes.map((n) =>
      n.type === 'ai' ? { ...n, model: 'claude-sonnet-5-5' } : n,
    )
    const { call } = fakeModel({ ...base, model: 'claude-sonnet-5-5', nodes })

    const result = await draftAgent(
      { description: 'Triage inbound support emails', model: 'claude-haiku-5-5' },
      call,
    )

    const aiSteps = result.definition.nodes.filter((n) => n.type === 'ai')
    expect(aiSteps.length).toBeGreaterThan(0)
    for (const step of aiSteps) expect(step.model).toBe('claude-haiku-5-5')
  })

  it('treats nulls as absent so optional fields parse', async () => {
    const def = good()
    const raw = {
      ...def,
      principles: null,
      nodes: def.nodes.map((node) => (node.type === 'ai' ? node : { ...node, label: node.label })),
      edges: def.edges.map((edge) => ({ ...edge, label: edge.label ?? null })),
    }
    const { call } = fakeModel(raw)
    const result = await draftAgent(
      { description: 'Triage support email', model: 'claude-haiku-5-5' },
      call,
    )
    expect(result.problems).toEqual([])
    expect(result.definition.principles).toBe('')
  })

  it('sends the problems back once and returns the repaired draft', async () => {
    const broken = {
      ...good(),
      edges: [...good().edges, { id: 'bad', from: 'classify', to: 'ghost' }],
    }
    const { call, calls } = fakeModel(broken, good())

    const result = await draftAgent(
      { description: 'Triage support email', model: 'claude-haiku-5-5' },
      call,
    )

    expect(result.problems).toEqual([])
    expect(calls).toHaveLength(2)
    const repair = calls[1]?.messages.at(-1)
    expect(repair?.content).toContain('Edge "bad" ends at unknown node "ghost"')
  })

  it('returns the problems that remain after one repair round', async () => {
    const broken = { ...good(), edges: [{ id: 'e1', from: 'trigger', to: 'classify' }] }
    const { call, calls } = fakeModel(broken, broken)

    const result = await draftAgent(
      { description: 'Triage support email', model: 'claude-haiku-5-5' },
      call,
    )

    expect(calls).toHaveLength(2)
    expect(result.problems).toContain('Node "classify" has no outgoing edge')
    expect(result.definition.nodes).toHaveLength(good().nodes.length)
  })

  it('reads a reply wrapped in a code fence, and repairs one that is not JSON', async () => {
    const fenced = `Here it is:\n\`\`\`json\n${JSON.stringify(good())}\n\`\`\``
    const fencedRun = fakeModel(fenced)
    const fencedResult = await draftAgent(
      { description: 'Triage support email', model: 'claude-haiku-5-5' },
      fencedRun.call,
    )
    expect(fencedResult.problems).toEqual([])

    const { call, calls } = fakeModel('I cannot do that.', good())
    const result = await draftAgent(
      { description: 'Triage support email', model: 'claude-haiku-5-5' },
      call,
    )
    expect(result.problems).toEqual([])
    expect(calls[1]?.messages.at(-1)?.content).toContain('the reply is not JSON')
  })

  it('fails when the repair does not produce a definition either', async () => {
    const { call } = fakeModel({ name: 'No nodes' }, { name: 'Still none' })
    await expect(
      draftAgent({ description: 'Triage support email', model: 'claude-haiku-5-5' }, call),
    ).rejects.toThrow(/no valid agent definition/)
  })
})
