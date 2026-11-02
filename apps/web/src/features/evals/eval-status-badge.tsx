import type { EvalRunStatus } from '@agentforgeloop/shared'
import { Badge } from '../../components/ui/badge.tsx'
import { cn } from '../../lib/cn.ts'
import { EVAL_STATUS_LABELS } from './eval-format.ts'

const DOTS: Record<EvalRunStatus, string> = {
  queued: 'bg-graphite',
  running: 'bg-accent motion-safe:animate-pulse',
  succeeded: 'bg-active',
  failed: 'bg-danger-solid',
}

export function EvalStatusBadge({ status }: { status: EvalRunStatus }) {
  return (
    <Badge>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', DOTS[status])} />
      {EVAL_STATUS_LABELS[status]}
    </Badge>
  )
}
