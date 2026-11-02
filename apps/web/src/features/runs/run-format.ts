import {
  type AgentWithVersions,
  MODEL_LABELS,
  ModelCallPayload,
  ModelId,
  type Run,
  type RunEvent,
  type RunStatus,
  type TriggerKind,
} from '@agentforgeloop/shared'

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  waiting_approval: 'Needs approval',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export const TRIGGER_LABELS: Record<TriggerKind, string> = {
  manual: 'Manual',
  api: 'API',
  webhook: 'Webhook',
  schedule: 'Schedule',
  eval: 'Eval',
}

/** "850 ms", "4.2 s", "2m 5s". */
export function durationLabel(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

/** Milliseconds from start to finish, or null while the run has not finished. */
export function runDurationMs(run: Pick<Run, 'startedAt' | 'finishedAt'>): number | null {
  if (!run.startedAt || !run.finishedAt) return null
  return new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
}

/** Node labels from one version's definition, so the feed reads "Check card number", not "n3". */
export function nodeLabels(
  agent: AgentWithVersions | undefined,
  versionNumber: number | null,
): Map<string, string> {
  const version = agent?.versions.find((item) => item.number === versionNumber)
  const nodes = version?.definition.nodes ?? []
  return new Map(nodes.map((node): [string, string] => [node.id, node.label]))
}

/** "Sonnet 5.5" for "claude-sonnet-5-5"; unknown model ids are shown as they are. */
export function modelLabel(model: string): string {
  const id = ModelId.safeParse(model)
  return id.success ? MODEL_LABELS[id.data].replace(/^Claude /, '') : model
}

/** JSON that parses to an object is sent as that object; anything else is sent as the text. */
export function parseRunInput(text: string): unknown {
  const trimmed = text.trim()
  try {
    const value: unknown = JSON.parse(trimmed)
    if (typeof value === 'object' && value !== null) return value
  } catch {
    // Not JSON: the text itself is the input.
  }
  return trimmed
}

/** Cost and tokens summed from the model_call events seen so far. */
export function usageTotals(events: RunEvent[]): { costUsd: number; tokens: number } {
  let costUsd = 0
  let tokens = 0
  for (const event of events) {
    if (event.kind !== 'model_call') continue
    const payload = ModelCallPayload.safeParse(event.payload)
    if (!payload.success) continue
    costUsd += payload.data.costUsd
    tokens += payload.data.inputTokens + payload.data.outputTokens
  }
  return { costUsd, tokens }
}
