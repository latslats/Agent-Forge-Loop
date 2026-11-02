import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { errorMessage, useCreateAgent } from '../../api/client.ts'
import { Button } from '../../components/ui/button.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input } from '../../components/ui/input.tsx'
import { Textarea } from '../../components/ui/textarea.tsx'
import { useToast } from '../../components/ui/toast.tsx'

/** A named agent with the default one-step graph; the steps are drafted on the canvas. */
export function BlankAgentForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const create = useCreateAgent()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const trimmedName = name.trim()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!trimmedName) return
    const trimmedDescription = description.trim()
    create.mutate(
      { name: trimmedName, description: trimmedDescription },
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

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name" htmlFor="new-agent-name">
        <Input
          id="new-agent-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Support triage"
          maxLength={80}
          required
        />
      </Field>
      <Field
        label="Description"
        htmlFor="new-agent-description"
        hint="Optional. Shown on the card."
      >
        <Textarea
          id="new-agent-description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Classify inbound emails and draft a reply."
        />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!trimmedName || create.isPending}>
          {create.isPending ? 'Creating…' : 'Create agent'}
        </Button>
      </div>
    </form>
  )
}
