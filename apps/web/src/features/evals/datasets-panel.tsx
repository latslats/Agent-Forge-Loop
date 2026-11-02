import type { EvalDataset } from '@agentforgeloop/shared'
import { Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { errorMessage } from '../../api/client.ts'
import { useCreateDataset, useDeleteDataset } from '../../api/evals.ts'
import { Button } from '../../components/ui/button.tsx'
import { Card } from '../../components/ui/card.tsx'
import { Dialog } from '../../components/ui/dialog.tsx'
import { Input } from '../../components/ui/input.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { cn } from '../../lib/cn.ts'

export function DatasetsPanel({
  agentId,
  datasets,
  selectedId,
  onSelect,
}: {
  agentId: string
  datasets: EvalDataset[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const toast = useToast()
  const create = useCreateDataset(agentId)
  const remove = useDeleteDataset()
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState<EvalDataset | null>(null)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '') return
    create.mutate(trimmed, {
      onSuccess: (dataset) => {
        setName('')
        onSelect(dataset.id)
      },
      onError: (error) => toast(errorMessage(error)),
    })
  }

  const confirmDelete = () => {
    if (!deleting) return
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast(`Deleted ${deleting.name}`)
        setDeleting(null)
      },
      onError: (error) => toast(errorMessage(error)),
    })
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Datasets</h2>
        <span className="text-xs text-muted tabular-nums">{datasets.length}</span>
      </div>

      <form onSubmit={submit} className="mt-3 flex gap-2">
        <Input
          aria-label="New dataset name"
          placeholder="New dataset name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" disabled={name.trim() === '' || create.isPending}>
          {create.isPending ? 'Creating…' : 'Create'}
        </Button>
      </form>

      {datasets.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          No datasets yet. A dataset holds the cases you test this agent with.
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {datasets.map((dataset) => {
            const active = dataset.id === selectedId
            return (
              <li key={dataset.id} className="flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={active}
                  title={dataset.name}
                  onClick={() => onSelect(dataset.id)}
                  className={cn(
                    'flex h-9 min-w-0 flex-1 items-center truncate rounded-control px-3 text-left text-sm',
                    active ? 'bg-accent-soft font-medium text-accent-ink' : 'hover:bg-sunken',
                  )}
                >
                  {dataset.name}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${dataset.name}`}
                  onClick={() => setDeleting(dataset)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Delete ${deleting?.name ?? 'dataset'}?`}
        description="This removes its cases and every eval run against it. This can't be undone."
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete} disabled={remove.isPending}>
            {remove.isPending ? 'Deleting…' : 'Delete dataset'}
          </Button>
        </div>
      </Dialog>
    </Card>
  )
}
