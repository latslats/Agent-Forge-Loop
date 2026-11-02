import { describe, expect, it } from 'vitest'
import { render } from './template.ts'

const scope = {
  input: { name: 'Ada', tags: ['a', 'b'] },
  vars: { count: 2 },
  prev: { reply: 'Hello', score: 0.5 },
}

describe('render', () => {
  it('replaces dotted paths over input, vars and prev', () => {
    expect(render('{{prev.reply}} {{input.name}} #{{vars.count}}', scope)).toBe('Hello Ada #2')
  })

  it('writes strings as-is and other values as JSON', () => {
    expect(render('{{prev.score}} {{input.tags}}', scope)).toBe('0.5 ["a","b"]')
  })

  it('turns a missing path into an empty string', () => {
    expect(render('[{{prev.nope}}][{{vars.missing.deep}}]', scope)).toBe('[][]')
  })

  it('allows spaces inside the braces and leaves text without placeholders alone', () => {
    expect(render('plain {{  prev.reply  }} text', scope)).toBe('plain Hello text')
  })
})
