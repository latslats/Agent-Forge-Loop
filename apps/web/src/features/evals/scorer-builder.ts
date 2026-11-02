import { type Scorer, Scorer as ScorerSchema } from '@agentforgeloop/shared'
import type { SelectOption } from '../../components/ui/select.tsx'

export type ScorerKind = Scorer['kind']

export const SCORER_KINDS: SelectOption[] = [
  { value: 'exact', label: 'Exact match' },
  { value: 'contains', label: 'Contains text' },
  { value: 'json_schema', label: 'JSON schema' },
  { value: 'llm_judge', label: 'LLM judge' },
  { value: 'tool_calls', label: 'Tools called' },
  { value: 'latency', label: 'Latency limit' },
  { value: 'cost', label: 'Cost limit' },
]

export const SCORER_FIELD: Record<
  ScorerKind,
  { label: string; hint: string; placeholder: string; multiline: boolean }
> = {
  exact: {
    label: 'Expected output',
    hint: 'The output must equal this text, ignoring outer spaces.',
    placeholder: '4',
    multiline: false,
  },
  contains: {
    label: 'Text to find',
    hint: 'Matched without regard to capitals.',
    placeholder: 'refund',
    multiline: false,
  },
  json_schema: {
    label: 'JSON schema',
    hint: 'The output must be JSON that matches this schema.',
    placeholder: '{"type":"object","required":["reply"]}',
    multiline: true,
  },
  llm_judge: {
    label: 'Rubric',
    hint: 'Claude Haiku grades the output against this rubric.',
    placeholder: 'The reply is polite and answers the question.',
    multiline: true,
  },
  tool_calls: {
    label: 'Tool names',
    hint: 'Comma-separated. Each tool must be called during the run.',
    placeholder: 'lookup_order, http_request',
    multiline: false,
  },
  latency: {
    label: 'Max milliseconds',
    hint: 'The run must finish within this time.',
    placeholder: '5000',
    multiline: false,
  },
  cost: {
    label: 'Max cost (USD)',
    hint: 'The run must cost no more than this.',
    placeholder: '0.01',
    multiline: false,
  },
}

export type ScorerBuild = { ok: true; scorer: Scorer } | { ok: false; error: string }

const parseObject = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** The raw object for one scorer kind, before zod checks it. */
const candidateFor = (kind: ScorerKind, value: string): unknown => {
  switch (kind) {
    case 'json_schema':
      return { kind, schema: parseObject(value) }
    case 'llm_judge':
      return { kind, rubric: value }
    case 'tool_calls':
      return {
        kind,
        tools: value
          .split(',')
          .map((tool) => tool.trim())
          .filter((tool) => tool !== ''),
      }
    case 'latency':
      return { kind, maxMs: Number(value) }
    case 'cost':
      return { kind, maxUsd: Number(value) }
    default:
      return { kind, expected: value }
  }
}

/** Turns one kind and its typed text into a shared Scorer, or a message the user can act on. */
export function buildScorer(kind: ScorerKind, text: string): ScorerBuild {
  const value = text.trim()
  const label = SCORER_FIELD[kind].label.toLowerCase()
  if (value === '') return { ok: false, error: `Enter the ${label}.` }
  const parsed = ScorerSchema.safeParse(candidateFor(kind, value))
  return parsed.success
    ? { ok: true, scorer: parsed.data }
    : { ok: false, error: `Check the ${label}.` }
}

const SHORT_NAME: Record<ScorerKind, string> = {
  exact: 'Exact',
  contains: 'Contains',
  json_schema: 'Schema',
  llm_judge: 'Judge',
  tool_calls: 'Tools',
  latency: 'Latency',
  cost: 'Cost',
}

/** A short chip text such as "Exact 4" or "Latency ≤ 5000 ms". */
export function scorerChipLabel(scorer: Scorer): string {
  const detail = (() => {
    switch (scorer.kind) {
      case 'exact':
      case 'contains':
        return `“${scorer.expected}”`
      case 'llm_judge':
        return ''
      case 'tool_calls':
        return scorer.tools.join(', ')
      case 'latency':
        return `≤ ${scorer.maxMs} ms`
      case 'cost':
        return `≤ $${scorer.maxUsd}`
      case 'json_schema':
        return ''
    }
  })()
  return detail ? `${SHORT_NAME[scorer.kind]} ${detail}` : SHORT_NAME[scorer.kind]
}

/** The short name of a scorer kind as a result shows it. Unknown kinds, such as 'run', pass through. */
export function scorerKindLabel(kind: string): string {
  return Object.hasOwn(SHORT_NAME, kind) ? SHORT_NAME[kind as ScorerKind] : kind
}
