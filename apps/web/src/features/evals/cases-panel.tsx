import type { EvalCase, EvalDataset } from '@agentforgeloop/shared'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '../../api/client.ts'
import { useCases } from '../../api/evals.ts'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card } from '../../components/ui/card.tsx'
import { EmptyState } from '../../components/ui/empty-state.tsx'
import { Spinner } from '../../components/ui/spinner.tsx'
import { CaseDialog } from './case-dialog.tsx'
import { scorerChipLabel } from './scorer-builder.ts'

/** The input as one line of text. */
const inputText = (input: unknown): string => {
  const text = typeof input === 'string' ? input : JSON.stringify(input)
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

/** The input cut short, for the table. The full text is in the cell's title. */
const previewInput = (input: unknown): string => {
  const flat = inputText(input)
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat
}

export function CasesPanel({ dataset }: { dataset: EvalDataset }) {
  const cases = useCases(dataset.id)
  const [editing, setEditing] = useState<EvalCase | 'new' | null>(null)

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-sm font-semibold" title={`Cases in ${dataset.name}`}>
          Cases in {dataset.name}
        </h2>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden="true" />
          Add case
        </Button>
      </div>

      <div className="mt-3">
        {cases.isPending && <Spinner label="Loading cases…" />}
        {cases.isError && (
          <EmptyState title="Couldn't load cases" description={errorMessage(cases.error)} />
        )}
        {cases.isSuccess && cases.data.length === 0 && (
          <EmptyState
            title="No cases yet"
            description="Add a case with an input and the checks that grade the output."
          />
        )}
        {cases.isSuccess && cases.data.length > 0 && (
          <div className="overflow-x-auto rounded-control border border-line">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Case
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Input
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Scorers
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Tags
                  </th>
                </tr>
              </thead>
              <tbody>
                {cases.data.map((evalCase) => (
                  <tr
                    key={evalCase.id}
                    className="border-b border-line last:border-b-0 hover:bg-sunken"
                  >
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => setEditing(evalCase)}
                        className="cursor-pointer text-left font-medium text-ink hover:text-accent-ink"
                      >
                        {evalCase.name}
                      </button>
                    </td>
                    <td className="max-w-56 px-3 py-2 align-top font-mono text-xs text-muted">
                      <span className="line-clamp-2 break-all" title={inputText(evalCase.input)}>
                        {previewInput(evalCase.input)}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <ul className="flex flex-wrap gap-1">
                        {evalCase.scorers.map((scorer) => (
                          <li
                            key={JSON.stringify(scorer)}
                            className="inline-flex h-6 items-center rounded-control border border-line px-2 text-xs text-muted"
                          >
                            {scorerChipLabel(scorer)}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <ul className="flex flex-wrap gap-1">
                        {evalCase.tags.map((tag) => (
                          <li key={tag}>
                            <Badge>{tag}</Badge>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CaseDialog datasetId={dataset.id} editing={editing} onClose={() => setEditing(null)} />
    </Card>
  )
}
