import type { AgentWithVersions } from '@agentforgeloop/shared'
import { ArrowLeft, Play, Upload } from 'lucide-react'
import { Link } from 'react-router'
import {
  errorMessage,
  isActiveRunStatus,
  usePublishVersion,
  useUpdateAgent,
} from '../../api/client.ts'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { timeAgo } from '../../lib/format.ts'
import { HealthRing } from '../insights/health-ring.tsx'
import { useActiveRun } from '../runs/active-run.ts'
import { TriggerChip } from '../triggers/trigger-chip.tsx'
import { AgentMenu } from './agent-menu.tsx'
import { EditableName } from './editable-name.tsx'
import { StatusBadge } from './status-badge.tsx'

export function AgentHeader({
  agent,
  publishable,
  onDelete,
  onRun,
}: {
  agent: AgentWithVersions
  /** False while the draft has unsaved edits or problems: Publish would drop them. */
  publishable: boolean
  onDelete: () => void
  onRun: () => void
}) {
  const toast = useToast()
  const running = isActiveRunStatus(useActiveRun(agent.id).status)
  const rename = useUpdateAgent(agent.id)
  const publish = usePublishVersion(agent.id)

  const publishNow = () =>
    publish.mutate(
      { note: '' },
      {
        onSuccess: (version) => toast(`Published v${version.number}`),
        onError: (error) => toast(errorMessage(error)),
      },
    )

  const renameTo = (name: string) =>
    rename.mutate({ name }, { onError: (error) => toast(errorMessage(error)) })

  return (
    <div className="px-6 pt-4">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Agents
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <div className="min-w-48 flex-1">
          <EditableName name={agent.name} onRename={renameTo} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" onClick={onRun}>
            {running ? (
              <span
                aria-hidden="true"
                className="size-4 rounded-full border-2 border-line border-t-accent motion-safe:animate-spin"
              />
            ) : (
              <Play className="size-4" aria-hidden="true" />
            )}
            Run
          </Button>
          <Button
            variant="primary"
            onClick={publishNow}
            disabled={publish.isPending || !publishable}
            title={publishable ? undefined : 'Wait for the draft to save and fix its problems'}
          >
            <Upload className="size-4" aria-hidden="true" />
            {publish.isPending ? 'Publishing…' : 'Publish'}
          </Button>
          <AgentMenu onDelete={onDelete} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 pb-4 text-xs text-muted">
        <StatusBadge status={agent.status} />
        <Badge tone="accent" className="tabular-nums">
          {agent.currentVersion === null ? 'Draft' : `v${agent.currentVersion}`}
        </Badge>
        <TriggerChip agent={agent} />
        <HealthRing agentId={agent.id} />
        <time dateTime={agent.updatedAt}>Updated {timeAgo(agent.updatedAt)}</time>
      </div>
    </div>
  )
}
