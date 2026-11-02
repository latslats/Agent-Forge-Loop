import type { Scorer } from '@agentforgeloop/shared'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/button.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input } from '../../components/ui/input.tsx'
import { Select } from '../../components/ui/select.tsx'
import { Textarea } from '../../components/ui/textarea.tsx'
import {
  buildScorer,
  SCORER_FIELD,
  SCORER_KINDS,
  type ScorerKind,
  scorerChipLabel,
} from './scorer-builder.ts'

/** Lists the scorers of a case and adds one at a time from a kind and its value. */
export function ScorerEditor({
  scorers,
  onAdd,
  onRemove,
}: {
  scorers: Scorer[]
  onAdd: (scorer: Scorer) => void
  onRemove: (index: number) => void
}) {
  const [kind, setKind] = useState<ScorerKind>('exact')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const field = SCORER_FIELD[kind]

  const chooseKind = (next: string) => {
    setKind(next as ScorerKind)
    setValue('')
    setError(null)
  }

  const add = () => {
    const built = buildScorer(kind, value)
    if (!built.ok) {
      setError(built.error)
      return
    }
    onAdd(built.scorer)
    setValue('')
    setError(null)
  }

  return (
    <div className="space-y-3">
      {scorers.length === 0 ? (
        <p className="text-sm text-muted">No scorers yet. Add at least one check.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {scorers.map((scorer, index) => {
            const label = scorerChipLabel(scorer)
            return (
              <li
                key={JSON.stringify(scorer)}
                className="inline-flex h-7 items-center gap-1 rounded-control border border-line pl-2.5 text-xs"
              >
                <span className="max-w-56 truncate" title={label}>
                  {label}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  onClick={() => onRemove(index)}
                  className="grid size-6 cursor-pointer place-items-center rounded-control text-muted hover:text-ink"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="space-y-3 rounded-control border border-line bg-sunken p-3">
        <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <Field label="Check" htmlFor="scorer-kind">
            <Select
              id="scorer-kind"
              value={kind}
              onValueChange={chooseKind}
              options={SCORER_KINDS}
            />
          </Field>
          <Field label={field.label} htmlFor="scorer-value" hint={field.hint}>
            {field.multiline ? (
              <Textarea
                id="scorer-value"
                rows={3}
                placeholder={field.placeholder}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            ) : (
              <Input
                id="scorer-value"
                placeholder={field.placeholder}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
          </Field>
        </div>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button size="sm" onClick={add}>
            <Plus className="size-4" aria-hidden="true" />
            Add scorer
          </Button>
        </div>
      </div>
    </div>
  )
}
