import type { Agent } from '@agentforgeloop/shared'
import { Link } from 'react-router'
import { Badge } from '../../components/ui/badge.tsx'
import { Card } from '../../components/ui/card.tsx'
import { timeAgo } from '../../lib/format.ts'
import { StatusBadge } from './status-badge.tsx'

export function AgentCard({ agent }: { agent: Agent }) {
  const version = agent.currentVersion === null ? 'Draft' : `v${agent.currentVersion}`
  return (
    <li>
      <Link to={`/agents/${agent.id}`} className="block h-full rounded-surface">
        <Card className="flex h-full flex-col gap-3 p-4 transition-colors duration-150 hover:border-accent">
          <div className="flex items-center justify-between gap-3">
            <StatusBadge status={agent.status} />
            <Badge className="tabular-nums">{version}</Badge>
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold tracking-tight" title={agent.name}>
              {agent.name}
            </h2>
            <p
              className="mt-1 line-clamp-2 text-sm text-muted"
              title={agent.description || undefined}
            >
              {agent.description || 'No description yet.'}
            </p>
          </div>
          <div className="mt-auto flex items-center justify-between gap-3 pt-1 text-xs text-muted">
            <Badge>Manual</Badge>
            <time dateTime={agent.updatedAt}>Updated {timeAgo(agent.updatedAt)}</time>
          </div>
        </Card>
      </Link>
    </li>
  )
}
