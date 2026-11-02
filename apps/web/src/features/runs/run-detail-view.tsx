import type { RunDetail } from '@agentforgeloop/shared'
import { ArrowLeft, Play } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { errorMessage, isActiveRunStatus, useAgent, useStartRun } from '../../api/client.ts'
import { Button } from '../../components/ui/button.tsx'
import { Card } from '../../components/ui/card.tsx'
import { compactNumber, money, timeAgo } from '../../lib/format.ts'
import { activeRunStore } from './active-run.ts'
import { ApprovalActions } from './approval-actions.tsx'
import { JsonBlock } from './json-block.tsx'
import { approvalMessages } from './run-event.tsx'
import { durationLabel, nodeLabels, runDurationMs, TRIGGER_LABELS } from './run-format.ts'
import { RunStatusBadge } from './run-status-badge.tsx'
import { RunTimeline } from './run-timeline.tsx'

/** The run page body: header, input and output, pending approvals and the timeline. */
export function RunDetailView({ run }: { run: RunDetail }) {
  const navigate = useNavigate()
  const agent = useAgent(run.agentId)
  const runAgain = useStartRun(run.agentId)
  const labels = nodeLabels(agent.data, run.versionNumber)
  const messages = approvalMessages(run.events)
  const pending = run.approvals.filter((approval) => approval.status === 'pending')
  const duration = runDurationMs(run)

  const again = () =>
    runAgain.mutate(
      { input: run.input },
      {
        onSuccess: (next) => {
          activeRunStore.start(next.id, next.agentId)
          navigate(`/runs/${next.id}`)
        },
      },
    )

  return (
    <div className="space-y-5 p-6">
      <header className="space-y-2">
        <Link
          to="/runs"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Runs
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Run</h1>
            <RunStatusBadge status={run.status} />
          </div>
          <Button
            variant="primary"
            onClick={again}
            disabled={runAgain.isPending || isActiveRunStatus(run.status)}
          >
            <Play className="size-4" aria-hidden="true" />
            {runAgain.isPending ? 'Starting…' : 'Run again'}
          </Button>
        </div>
        <p className="text-sm text-muted">
          <Link to={`/agents/${run.agentId}`} className="font-medium text-ink hover:underline">
            {agent.data?.name ?? 'Agent'}
          </Link>
          {' · '}v{run.versionNumber} · {TRIGGER_LABELS[run.triggerKind]} · started{' '}
          {timeAgo(run.startedAt ?? run.createdAt)}
        </p>
      </header>

      {runAgain.isError && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(runAgain.error)}
        </p>
      )}
      {run.error && (
        <p
          role="alert"
          className="rounded-control border border-line p-3 text-sm text-danger break-words"
        >
          {run.error}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Duration" value={duration === null ? '—' : durationLabel(duration)} />
        <Stat label="Cost" value={money(run.costUsd)} />
        <Stat label="Tokens in" value={compactNumber(run.tokensIn)} />
        <Stat label="Tokens out" value={compactNumber(run.tokensOut)} />
      </dl>

      {pending.map((approval) => (
        <Card key={approval.id} className="space-y-3 border-paused p-4">
          <h2 className="text-sm font-semibold">Waiting for your decision</h2>
          <p className="text-sm break-words">
            {messages.get(approval.id) ?? 'This run is paused until someone decides.'}
          </p>
          <ApprovalActions runId={run.id} approvalId={approval.id} />
        </Card>
      ))}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <details open>
            <summary className="cursor-pointer text-sm font-semibold">Input</summary>
            <JsonBlock value={run.input} />
          </details>
        </Card>
        <Card className="p-4">
          <details open>
            <summary className="cursor-pointer text-sm font-semibold">Output</summary>
            <JsonBlock value={run.output} />
          </details>
        </Card>
      </div>

      <section aria-labelledby="timeline-heading" className="space-y-2">
        <h2 id="timeline-heading" className="text-sm font-semibold">
          Timeline
        </h2>
        <RunTimeline events={run.events} labels={labels} />
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
    </Card>
  )
}
