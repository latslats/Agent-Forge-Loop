import type { CheckConfig } from '@agentforgeloop/shared'
import { validate } from './json-schema.ts'
import type { JudgeResult, Llm } from './llm.ts'
import type { RunState } from './types.ts'

/** `judge` is set for llm_judge checks, so the check node can add the judge's cost to the run. */
export type CheckResult = { pass: boolean; reason: string; judge?: JudgeResult }

type RegexCheck = Extract<CheckConfig, { kind: 'regex' }>
type JsonSchemaCheck = Extract<CheckConfig, { kind: 'json_schema' }>

/** A string is used as it is; any other value is written as JSON. */
const textOf = (value: unknown): string =>
  typeof value === 'string' ? value : (JSON.stringify(value) ?? '')

const targetOf = (target: 'input' | 'output', state: RunState): unknown =>
  target === 'input' ? state.input : state.prev

const parseOrKeep = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const regexResult = (check: RegexCheck, text: string): CheckResult => {
  const match = new RegExp(check.pattern, check.flags).exec(text)
  if (check.mode === 'block') {
    return match
      ? { pass: false, reason: `Matched "${match[0]}", which is blocked` }
      : { pass: true, reason: 'No blocked pattern found' }
  }
  return match
    ? { pass: true, reason: `Matched "${match[0]}"` }
    : { pass: false, reason: `No match for /${check.pattern}/` }
}

const jsonSchemaResult = (check: JsonSchemaCheck, value: unknown): CheckResult => {
  const parsed = typeof value === 'string' ? parseOrKeep(value) : value
  const problems = validate(check.schema, parsed)
  return problems.length === 0
    ? { pass: true, reason: 'Matches the JSON schema' }
    : { pass: false, reason: problems.join('; ') }
}

/** Runs one check against the run's state. Errors (a bad regex, a failed judge call) throw. */
export const runCheck = async (
  check: CheckConfig,
  state: RunState,
  deps: { llm: Llm; signal?: AbortSignal },
): Promise<CheckResult> => {
  switch (check.kind) {
    case 'regex':
      return regexResult(check, textOf(targetOf(check.target, state)))
    case 'json_schema':
      return jsonSchemaResult(check, targetOf(check.target, state))
    case 'llm_judge': {
      const judge = await deps.llm.judge({
        rubric: check.rubric,
        text: textOf(targetOf(check.target, state)),
        signal: deps.signal,
      })
      return { pass: judge.verdict.pass, reason: judge.verdict.reason, judge }
    }
    case 'cost_cap':
      return state.costUsd <= check.maxUsd
        ? { pass: true, reason: `Cost $${state.costUsd.toFixed(4)} is within the cap` }
        : {
            pass: false,
            reason: `Cost $${state.costUsd.toFixed(4)} is over the $${check.maxUsd} cap`,
          }
    case 'tool_allowlist': {
      // toolsUsed holds '<connectionId>__<tool>' names, the same form as the allowlist.
      const allowed = new Set(check.tools)
      const unlisted = state.toolsUsed.filter((tool) => !allowed.has(tool))
      return unlisted.length === 0
        ? { pass: true, reason: 'Every tool used is on the allowlist' }
        : { pass: false, reason: `Tools not on the allowlist: ${unlisted.join(', ')}` }
    }
  }
}
