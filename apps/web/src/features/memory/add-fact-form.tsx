import { type FormEvent, useState } from 'react'
import { errorMessage } from '../../api/client.ts'
import { useCreateMemory } from '../../api/memory.ts'
import { Button } from '../../components/ui/button.tsx'
import { Input } from '../../components/ui/input.tsx'
import { useToast } from '../../components/ui/toast.tsx'

export function AddFactForm({ agentId }: { agentId: string }) {
  const toast = useToast()
  const create = useCreateMemory(agentId)
  const [content, setContent] = useState('')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = content.trim()
    if (trimmed === '') return
    create.mutate(
      { content: trimmed },
      {
        onSuccess: () => setContent(''),
        onError: (error) => toast(errorMessage(error)),
      },
    )
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        aria-label="New fact"
        placeholder="Add a fact, for example: prefers short replies"
        value={content}
        onChange={(event) => setContent(event.target.value)}
      />
      <Button type="submit" disabled={content.trim() === '' || create.isPending}>
        {create.isPending ? 'Adding…' : 'Add fact'}
      </Button>
    </form>
  )
}
