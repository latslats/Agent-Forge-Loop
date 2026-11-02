import { describe, expect, it } from 'vitest'
import { evalExpression, runCode, type Scope } from './sandbox.ts'

const scope = (): Scope => ({ input: { n: 3 }, vars: {}, prev: null })

describe('runCode', () => {
  it('returns the value of a return statement', () => {
    expect(runCode('return input.n * 2', scope())).toBe(6)
  })

  it('writes vars back to the scope', () => {
    const s = scope()
    runCode('vars.count = (vars.count ?? 0) + 1; vars.label = "x"; return null', s)
    expect(s.vars).toEqual({ count: 1, label: 'x' })
  })

  it('stops a loop that runs past the timeout with a clear message', () => {
    expect(() => runCode('while (true) {}', scope(), 100)).toThrow(
      'Code step timed out after 100 ms',
    )
  })

  it('turns a thrown error into an Error with the message', () => {
    expect(() => runCode("throw new Error('boom')", scope())).toThrow('Code step threw: boom')
  })

  it('does not expose the host process through constructors', () => {
    const s = scope()
    expect(runCode("return this.constructor.constructor('return typeof process')()", s)).toBe(
      'undefined',
    )
    expect(runCode("return input.constructor.constructor('return typeof process')()", s)).toBe(
      'undefined',
    )
  })
})

describe('evalExpression', () => {
  it('is true or false by the expression result', () => {
    expect(evalExpression('input.n > 2', scope())).toBe(true)
    expect(evalExpression('input.n > 10', scope())).toBe(false)
  })
})
