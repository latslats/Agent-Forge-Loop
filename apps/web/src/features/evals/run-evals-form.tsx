import type { AgentWithVersions } from '@agentforgeloop/shared'
import { useState } from 'react'
import { errorMessage } from '../../api/client.ts'
import { useStartEvalRun } from '../../api/evals.ts'
import { Button } from '../../components/ui/button.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Select } from '../../components/ui/select.tsx'
import { useToast } from '../../components/ui/toast.tsx'

/** Picks a published version and starts an eval run of the dataset on it. */
export function RunEvalsForm({
  agent,
  datasetId,
  caseCount,
  onStarted,
}: {
  agent: AgentWithVersions
  datasetId: string
  caseCount: number
  onStarted: (evalRunId: string) => void
}) {
  const toast = useToast()
  const start = useStartEvalRun(agent.id)
  const [picked, setPicked] = useState<string | null>(null)
  const current = agent.currentVersion
  const versions = [...agent.versions].sort((a, b) => b.number - a.number)
  const selected = picked ?? (current === null ? '' : String(current))

  const label = current === null ? 'Publish first' : 'Run evals'
  const blockedReason =
    current === null
      ? 'Publish a version before running evals.'
      : caseCount === 0
        ? 'Add a case to run evals.'
        : null

  const run = () =>
    start.mutate(
      { datasetId, versionNumber: Number(selected) },
      {
        onSuccess: (evalRun) => {
          toast(`Eval run started on v${evalRun.versionNumber}`)
          onStarted(evalRun.id)
        },
        onError: (error) => toast(errorMessage(error)),
      },
    )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Field label="Version" htmlFor="eval-version">
            <Select
              id="eval-version"
              value={selected}
              onValueChange={setPicked}
              options={versions.map((version) => ({
                value: String(version.number),
                label:
                  version.number === current
                    ? `v${version.number} · current`
                    : `v${version.number}`,
              }))}
            />
          </Field>
        </div>
        <Button
          variant="primary"
          onClick={run}
          disabled={blockedReason !== null || start.isPending}
        >
          {start.isPending ? 'Starting…' : label}
        </Button>
      </div>
      {blockedReason && <p className="text-xs text-muted">{blockedReason}</p>}
    </div>
  )
}
