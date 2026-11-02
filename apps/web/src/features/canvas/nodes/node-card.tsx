import { Handle, Position } from '@xyflow/react'
import { Check } from 'lucide-react'
import { cn } from '../../../lib/cn.ts'
import type { FlowNodeData } from '../definition-graph.ts'
import { NODE_INFO } from '../node-info.ts'
import { nodeSummary } from './node-summary.ts'

/** A source handle. Labelled handles show their label outside the card. */
export type OutputHandle = { id?: string; label?: string; tone?: 'ok' | 'fail' }

const TONE_COLOR = { ok: 'var(--color-active)', fail: 'var(--color-danger)' } as const

/** The compact card every node kind shares. Each kind file only picks its handles. */
export function NodeCard({
  data,
  selected,
  input,
  outputs,
}: {
  data: FlowNodeData
  selected: boolean
  input: boolean
  outputs: OutputHandle[]
}) {
  const { def, run } = data
  const info = NODE_INFO[def.type]
  const Icon = info.icon
  return (
    <div
      data-kind={def.type}
      data-run={run ?? undefined}
      className={cn(
        'relative w-[220px] rounded-surface border border-line bg-panel shadow-sm transition-shadow duration-150',
        selected && 'ring-2 ring-accent',
        run === 'failed' && 'ring-2 ring-danger',
        run === 'running' && 'canvas-node-running',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('absolute inset-y-3 left-0 w-[3px] rounded-r-full', info.rail)}
      />
      <div className="flex gap-2.5 py-3 pr-3 pl-4">
        <span className="grid size-7 shrink-0 place-items-center rounded-control bg-sunken text-muted">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <span className="truncate" title={def.label}>
              {def.label}
            </span>
            {run === 'done' && (
              <Check className="size-3.5 shrink-0 text-active" aria-label="Completed" />
            )}
          </p>
          <p className="text-[11px] tracking-wide text-muted uppercase">{info.label}</p>
          <p className="mt-1 truncate text-xs text-muted" title={nodeSummary(def)}>
            {nodeSummary(def)}
          </p>
        </div>
      </div>
      {input && <Handle type="target" position={Position.Left} />}
      {outputs.map((handle, index) => {
        const top = `${(100 * (index + 1)) / (outputs.length + 1)}%`
        const color = handle.tone ? TONE_COLOR[handle.tone] : undefined
        return (
          <div key={handle.id ?? 'default'}>
            <Handle
              type="source"
              position={Position.Right}
              id={handle.id}
              style={{ top, background: color }}
            />
            {handle.label && (
              <span
                className="pointer-events-none absolute left-full ml-3 -translate-y-1/2 text-[11px] font-medium"
                style={{ top, color }}
              >
                {handle.label}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
