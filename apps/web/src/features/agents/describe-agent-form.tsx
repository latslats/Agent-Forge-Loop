import { DEFAULT_MODEL, MODEL_IDS, MODEL_LABELS, type ModelId } from '@agentforgeloop/shared'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { errorMessage, useCreateAgent } from '../../api/client.ts'
import { useDraftAgent } from '../../api/draft.ts'
import { Button } from '../../components/ui/button.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Select } from '../../components/ui/select.tsx'
import { Spinner } from '../../components/ui/spinner.tsx'
import { Textarea } from '../../components/ui/textarea.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { DraftPreview } from './draft-preview.tsx'

const MIN_LENGTH = 10
const MODEL_OPTIONS = MODEL_IDS.map((id) => ({ value: id, label: MODEL_LABELS[id] }))

const isModelId = (value: string): value is ModelId =>
  (MODEL_IDS as readonly string[]).includes(value)

/** Turns a plain-language description into a drafted graph; Create saves it as a draft agent. */
export function DescribeAgentForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const draft = useDraftAgent()
  const create = useCreateAgent()
  const [description, setDescription] = useState('')
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL)
  const trimmed = description.trim()
  const drafted = draft.data

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (trimmed.length < MIN_LENGTH || draft.isPending) return
    draft.mutate({ description: trimmed, model })
  }

  const createDrafted = () => {
    if (!drafted || drafted.problems.length > 0) return
    const { name, description: summary } = drafted.definition
    create.mutate(
      { name, description: summary, draft: drafted.definition },
      {
        onSuccess: (agent) => {
          toast(`Created ${agent.name}`)
          onDone()
          navigate(`/agents/${agent.id}`)
        },
        onError: (error) => toast(errorMessage(error)),
      },
    )
  }

  const canCreate = drafted !== undefined && drafted.problems.length === 0 && !create.isPending

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field
        label="Describe the agent"
        htmlFor="draft-description"
        hint="Say what it receives, what it decides, and what must wait for a person."
      >
        <Textarea
          id="draft-description"
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Triage inbound support emails: classify, draft a reply, block if it contains card numbers, ask a human before sending"
        />
      </Field>
      <Field
        label="Model"
        htmlFor="draft-model"
        hint="Drafts with this model, and the agent runs on it."
      >
        <Select
          id="draft-model"
          value={model}
          onValueChange={(value) => isModelId(value) && setModel(value)}
          options={MODEL_OPTIONS}
        />
      </Field>

      {draft.isPending && <Spinner label="Drafting the steps… this can take 10 to 30 seconds." />}
      {draft.isError && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(draft.error)}
        </p>
      )}
      {drafted && !draft.isPending && <DraftPreview draft={drafted} />}

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="submit"
          variant={drafted ? 'secondary' : 'primary'}
          disabled={trimmed.length < MIN_LENGTH || draft.isPending}
        >
          {draft.isPending ? 'Drafting…' : drafted ? 'Draft again' : 'Draft it'}
        </Button>
        {drafted && (
          <Button variant="primary" onClick={createDrafted} disabled={!canCreate}>
            {create.isPending ? 'Creating…' : 'Create agent'}
          </Button>
        )}
      </div>
    </form>
  )
}
