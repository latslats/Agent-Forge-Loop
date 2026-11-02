import { NodeEndPayload, type RunEvent } from '@agentforgeloop/shared'
import { cn } from '../../lib/cn.ts'
import { EventRow } from './run-event.tsx'
import { durationLabel } from './run-format.ts'

export type NodeGroup = {
  key: string
  title: string
  durationMs: number | null
  failed: boolean
  events: RunEvent[]
}

/** Groups events by node, in order of first appearance. Run-level events form a "Run" group. */
export function groupByNode(events: RunEvent[], labels: ReadonlyMap<string, string>): NodeGroup[] {
  const groups = new Map<string, NodeGroup>()
  for (const event of events) {
    const key = event.nodeId ?? 'run'
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        title: event.nodeId ? (labels.get(event.nodeId) ?? event.nodeId) : 'Run',
        durationMs: null,
        failed: false,
        events: [],
      }
      groups.set(key, group)
    }
    group.events.push(event)
    const end = event.kind === 'node_end' ? NodeEndPayload.safeParse(event.payload) : null
    if (end?.success) {
      group.durationMs = (group.durationMs ?? 0) + end.data.durationMs
      group.failed ||= end.data.status === 'failed'
    }
  }
  return [...groups.values()]
}

/** The run's events grouped by node, each with its duration and raw payloads. */
export function RunTimeline({
  events,
  labels,
}: {
  events: RunEvent[]
  labels: ReadonlyMap<string, string>
}) {
  const groups = groupByNode(events, labels)
  if (groups.length === 0) {
    return <p className="text-sm text-muted">No steps were recorded for this run.</p>
  }
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <section
          key={group.key}
          aria-label={group.title}
          className="rounded-surface border border-line bg-panel p-3"
        >
          <header className="mb-1 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold break-words">{group.title}</h3>
            <span
              className={cn('text-xs tabular-nums', group.failed ? 'text-danger' : 'text-muted')}
            >
              {group.failed ? 'Failed · ' : ''}
              {group.durationMs === null ? '' : durationLabel(group.durationMs)}
            </span>
          </header>
          <ol className="space-y-0.5">
            {group.events.map((event) => (
              <EventRow key={event.id} event={event} labels={labels} showRaw />
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
