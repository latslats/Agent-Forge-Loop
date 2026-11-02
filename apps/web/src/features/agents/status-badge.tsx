import type { AgentStatus } from '@agentforgeloop/shared'
import { Badge } from '../../components/ui/badge.tsx'

const LABELS: Record<AgentStatus, string> = { draft: 'Draft', active: 'Active', paused: 'Paused' }

export function StatusBadge({ status }: { status: AgentStatus }) {
  return <Badge tone={status}>{LABELS[status]}</Badge>
}
