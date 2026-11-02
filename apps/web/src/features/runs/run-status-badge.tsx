import type { RunStatus } from '@agentforgeloop/shared'
import { Badge } from '../../components/ui/badge.tsx'
import { cn } from '../../lib/cn.ts'
import { RUN_STATUS_LABELS } from './run-format.ts'

const DOTS: Record<RunStatus, string> = {
  queued: 'bg-graphite',
  running: 'bg-accent motion-safe:animate-pulse',
  waiting_approval: 'bg-paused',
  succeeded: 'bg-active',
  failed: 'bg-danger-solid',
  cancelled: 'bg-graphite',
}

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', DOTS[status])} />
      {RUN_STATUS_LABELS[status]}
    </Badge>
  )
}
