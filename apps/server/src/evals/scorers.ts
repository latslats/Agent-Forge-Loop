import {
  type Run,
  type RunEvent,
  type ScoreResult,
  type Scorer,
  ToolCallPayload,
} from '@agentforgeloop/shared'
import { validate } from '../engine/json-schema.ts'
import type { Llm } from '../engine/llm.ts'

export type ScoreContext = { output: unknown; run: Run; events: RunEvent[]; llm: Llm }

/** Milliseconds from start to finish; 0 while the run has not finished. */
export const runLatencyMs = (run: Pick<Run, 'startedAt' | 'finishedAt'>): number =>
  run.startedAt && run.finishedAt ? Date.parse(run.finishedAt) - Date.parse(run.startedAt) : 0

const asText = (value: unknown): string =>
  typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value))

const oneLine = (text: string, max = 120): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

const result = (kind: string, pass: boolean, reason: string): ScoreResult => ({
  kind,
  pass,
  reason: oneLine(reason),
})

const jsonSchemaScore = (schema: Record<string, unknown>, output: unknown): ScoreResult => {
  let value: unknown = output
  if (typeof output === 'string') {
    try {
      value = JSON.parse(output)
    } catch {
      return result('json_schema', false, 'The output is not valid JSON')
    }
  }
  const problems = validate(schema, value)
  return problems.length === 0
    ? result('json_schema', true, 'The output matches the schema')
    : result('json_schema', false, problems.slice(0, 3).join('; '))
}

/** Scores one run against one scorer. Judge and other failures are the caller's to catch. */
export const score = async (scorer: Scorer, ctx: ScoreContext): Promise<ScoreResult> => {
  switch (scorer.kind) {
    case 'exact': {
      const actual = asText(ctx.output).trim()
      const expected = scorer.expected.trim()
      return actual === expected
        ? result('exact', true, 'The output matches the expected text')
        : result('exact', false, `Expected "${expected}", got "${actual}"`)
    }
    case 'contains': {
      const found = asText(ctx.output).toLowerCase().includes(scorer.expected.toLowerCase())
      return found
        ? result('contains', true, `The output contains "${scorer.expected}"`)
        : result('contains', false, `The output does not contain "${scorer.expected}"`)
    }
    case 'json_schema':
      return jsonSchemaScore(scorer.schema, ctx.output)
    case 'llm_judge': {
      // The judge returns a pass verdict only, so the score is 1 or 0 and the threshold is unused.
      const { verdict } = await ctx.llm.judge({ rubric: scorer.rubric, text: asText(ctx.output) })
      return { ...result('llm_judge', verdict.pass, verdict.reason), score: verdict.pass ? 1 : 0 }
    }
    case 'tool_calls': {
      const called = new Set(
        ctx.events.flatMap((event) => {
          if (event.kind !== 'tool_call') return []
          const payload = ToolCallPayload.safeParse(event.payload)
          return payload.success ? [payload.data.tool] : []
        }),
      )
      const missing = scorer.tools.filter((tool) => !called.has(tool))
      return missing.length === 0
        ? result('tool_calls', true, 'Called every expected tool')
        : result('tool_calls', false, `Did not call ${missing.join(', ')}`)
    }
    case 'latency': {
      const ms = runLatencyMs(ctx.run)
      return ms <= scorer.maxMs
        ? result('latency', true, `Took ${ms} ms (limit ${scorer.maxMs} ms)`)
        : result('latency', false, `Took ${ms} ms, over the ${scorer.maxMs} ms limit`)
    }
    case 'cost': {
      const cost = ctx.run.costUsd
      return cost <= scorer.maxUsd
        ? result('cost', true, `Cost $${cost.toFixed(4)} (limit $${scorer.maxUsd})`)
        : result('cost', false, `Cost $${cost.toFixed(4)}, over the $${scorer.maxUsd} limit`)
    }
  }
}
