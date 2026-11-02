import type { DraftAgentResponse } from '@agentforgeloop/shared'
import { NODE_INFO } from '../canvas/node-info.ts'

/** The drafted steps as a rail, in flow order (left to right, then top to bottom). */
export function DraftPreview({ draft }: { draft: DraftAgentResponse }) {
  const steps = [...draft.definition.nodes].sort(
    (a, b) => a.position.x - b.position.x || a.position.y - b.position.y,
  )
  return (
    <div className="space-y-3">
      <ul className="max-h-64 space-y-0 overflow-y-auto">
        {steps.map((node) => {
          const info = NODE_INFO[node.type]
          const kind = node.type === 'check' ? `${info.label} · ${node.check.kind}` : info.label
          return (
            <li key={node.id} className="relative flex gap-3 pb-3 last:pb-0">
              <span
                aria-hidden="true"
                className={`mt-1.5 size-2.5 shrink-0 rounded-full ${info.rail} ring-3 ring-panel`}
              />
              <div className="min-w-0">
                <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                  {kind}
                </p>
                <p className="truncate text-sm text-ink" title={node.label}>
                  {node.label}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
      {draft.problems.length > 0 && (
        <div role="alert" className="rounded-control border border-line p-3 text-sm">
          <p className="font-medium text-danger">The draft has problems and can't be created:</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-muted">
            {draft.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          <p className="mt-2 text-muted">Change the description and draft again.</p>
        </div>
      )}
    </div>
  )
}
