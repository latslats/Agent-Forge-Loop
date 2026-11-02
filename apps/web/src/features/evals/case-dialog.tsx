import type { CreateCaseBody, EvalCase, Scorer } from '@agentforgeloop/shared'
import { type FormEvent, useState } from 'react'
import { errorMessage } from '../../api/client.ts'
import { useCreateCase, useDeleteCase, useUpdateCase } from '../../api/evals.ts'
import { Button } from '../../components/ui/button.tsx'
import { Dialog } from '../../components/ui/dialog.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input } from '../../components/ui/input.tsx'
import { Textarea } from '../../components/ui/textarea.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { parseRunInput } from '../runs/run-format.ts'
import { ScorerEditor } from './scorer-editor.tsx'

/** `editing` is 'new' for a blank case, a case to edit it, or null while closed. */
export function CaseDialog({
  datasetId,
  editing,
  onClose,
}: {
  datasetId: string
  editing: EvalCase | 'new' | null
  onClose: () => void
}) {
  const isNew = editing === 'new' || editing === null
  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={isNew ? 'New case' : 'Edit case'}
      description="Give the agent an input and the checks that grade its output."
    >
      {editing !== null && (
        <CaseForm
          key={editing === 'new' ? 'new' : editing.id}
          datasetId={datasetId}
          initial={editing === 'new' ? null : editing}
          onDone={onClose}
        />
      )}
    </Dialog>
  )
}

const inputToText = (input: unknown): string =>
  typeof input === 'string' ? input : (JSON.stringify(input, null, 2) ?? '')

const parseTags = (text: string): string[] =>
  text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '')

/** Mounted fresh each time the dialog opens, so its fields start from the case. */
function CaseForm({
  datasetId,
  initial,
  onDone,
}: {
  datasetId: string
  initial: EvalCase | null
  onDone: () => void
}) {
  const toast = useToast()
  const create = useCreateCase(datasetId)
  const update = useUpdateCase()
  const remove = useDeleteCase()
  const [name, setName] = useState(initial?.name ?? '')
  const [inputText, setInputText] = useState(initial ? inputToText(initial.input) : '')
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '')
  const [scorers, setScorers] = useState<Scorer[]>(initial?.scorers ?? [])
  const [error, setError] = useState<string | null>(null)
  const busy = create.isPending || update.isPending || remove.isPending

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (name.trim() === '') return setError('Enter a name for the case.')
    if (inputText.trim() === '') return setError('Enter the input the agent receives.')
    if (scorers.length === 0) return setError('Add at least one scorer.')

    const body: CreateCaseBody = {
      name: name.trim(),
      input: parseRunInput(inputText),
      scorers,
      tags: parseTags(tags),
    }
    const onSaved = {
      onSuccess: () => {
        toast(initial ? 'Case saved' : 'Case added')
        onDone()
      },
      onError: (failure: unknown) => setError(errorMessage(failure)),
    }
    if (initial) update.mutate({ id: initial.id, body }, onSaved)
    else create.mutate(body, onSaved)
  }

  const deleteCase = () => {
    if (!initial) return
    remove.mutate(initial.id, {
      onSuccess: () => {
        toast('Case deleted')
        onDone()
      },
      onError: (failure) => setError(errorMessage(failure)),
    })
  }

  return (
    <form onSubmit={save} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      <Field label="Name" htmlFor="case-name">
        <Input
          id="case-name"
          value={name}
          placeholder="Doubles a small number"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field
        label="Input"
        htmlFor="case-input"
        hint="Plain text, or a JSON object the agent reads as its input."
      >
        <Textarea
          id="case-input"
          rows={4}
          className="font-mono text-[13px]"
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
        />
      </Field>

      <Field label="Tags" htmlFor="case-tags" hint="Comma-separated. Optional.">
        <Input
          id="case-tags"
          value={tags}
          placeholder="billing, refund"
          onChange={(event) => setTags(event.target.value)}
        />
      </Field>

      <div className="space-y-2">
        <span className="block text-xs font-medium text-muted">Scorers</span>
        <ScorerEditor
          scorers={scorers}
          onAdd={(scorer) => setScorers((current) => [...current, scorer])}
          onRemove={(index) =>
            setScorers((current) => current.filter((_, position) => position !== index))
          }
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        {initial ? (
          <Button variant="danger" onClick={deleteCase} disabled={busy}>
            Delete case
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save case'}
          </Button>
        </div>
      </div>
    </form>
  )
}
