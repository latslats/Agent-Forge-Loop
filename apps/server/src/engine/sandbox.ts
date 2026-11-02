import vm from 'node:vm'

/** The variables a Code or Branch step sees. `vars` is written back after each run. */
export type Scope = { input: unknown; vars: Record<string, unknown>; prev: unknown }

type Globals = { input?: unknown; vars?: unknown; prev?: unknown }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Errors thrown inside the vm context come from another realm, so instanceof Error is false for them.
const messageOf = (err: unknown): string =>
  typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string'
    ? err.message
    : String(err)

const toSandboxError = (err: unknown, timeoutMs: number): Error => {
  const message = messageOf(err)
  if (message.includes('timed out')) return new Error(`Code step timed out after ${timeoutMs} ms`)
  return new Error(`Code step threw: ${message}`)
}

/**
 * Runs `source` as the body of a function in a fresh node:vm context. `input`, `vars` and `prev`
 * are visible as variables; `return` gives the value. The context is not a security boundary, so
 * this is for the user's own code only.
 */
export const runCode = (source: string, scope: Scope, timeoutMs = 2000): unknown => {
  // A null prototype keeps `this.constructor` out of the host's reach. The values are parsed by the
  // context's own JSON.parse, so their prototypes are the context's too.
  const sandbox: Globals = Object.create(null)
  const context = vm.createContext(sandbox)
  const parse = vm.runInContext('JSON.parse', context) as (text: string) => unknown
  const copyIn = (value: unknown): unknown => parse(JSON.stringify(value ?? null))
  sandbox.input = copyIn(scope.input)
  sandbox.vars = copyIn(scope.vars)
  sandbox.prev = copyIn(scope.prev)
  try {
    const script = new vm.Script(`(function () {\n${source}\n})()`, { filename: 'code-step.js' })
    const value: unknown = script.runInContext(context, { timeout: timeoutMs })
    if (isRecord(sandbox.vars)) scope.vars = structuredClone(sandbox.vars)
    return structuredClone(value)
  } catch (err) {
    throw toSandboxError(err, timeoutMs)
  }
}

/** Branch expressions: a JS expression over { input, vars, prev }, truthy means the 'true' edge. */
export const evalExpression = (expression: string, scope: Scope): boolean =>
  Boolean(runCode(`return (\n${expression}\n)`, scope))
