import { validateDefinition } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { NotFoundError } from './errors.ts'
import { getTemplate, listTemplates } from './templates.ts'

describe('templates', () => {
  it('lists three templates whose node counts match their graphs', () => {
    const summaries = listTemplates()
    expect(summaries.map((t) => t.name)).toEqual([
      'Support email triage',
      'Invoice data extraction',
      'Daily news digest',
    ])
    for (const summary of summaries) {
      expect(getTemplate(summary.id).definition.nodes).toHaveLength(summary.nodeCount)
    }
    expect(new Set(summaries.map((t) => t.id)).size).toBe(summaries.length)
    expect(summaries[0]).not.toHaveProperty('definition')
  })

  it('gives every template a definition that passes validateDefinition', () => {
    for (const summary of listTemplates()) {
      expect(validateDefinition(getTemplate(summary.id).definition)).toEqual([])
    }
  })

  it('throws NotFoundError for an unknown id', () => {
    expect(() => getTemplate('nope')).toThrow(NotFoundError)
  })
})
