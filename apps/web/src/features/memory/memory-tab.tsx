import type { AgentWithVersions } from '@agentforgeloop/shared'
import { Brain } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '../../api/client.ts'
import { useClearMemories, useMemories } from '../../api/memory.ts'
import { Button } from '../../components/ui/button.tsx'
import { Dialog } from '../../components/ui/dialog.tsx'
import { EmptyState } from '../../components/ui/empty-state.tsx'
import { Spinner } from '../../components/ui/spinner.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { AddFactForm } from './add-fact-form.tsx'
import { MemoryList } from './memory-list.tsx'

/** The agent's remembered facts, with add, delete and clear. */
export function MemoryTab({ agent }: { agent: AgentWithVersions }) {
  const toast = useToast()
  const memories = useMemories(agent.id)
  const clear = useClearMemories(agent.id)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const memoryOn = agent.draft.memory.enabled
  const count = memories.data?.length ?? 0

  const confirmClear = () =>
    clear.mutate(undefined, {
      onSuccess: () => {
        toast('Memory cleared')
        setConfirmingClear(false)
      },
      onError: (error) => toast(errorMessage(error)),
    })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Memory</h2>
          <p className="text-sm text-muted">Facts {agent.name} keeps between runs.</p>
        </div>
        <Button
          variant="secondary"
          disabled={count === 0 || clear.isPending}
          onClick={() => setConfirmingClear(true)}
        >
          Clear all
        </Button>
      </div>

      {!memoryOn && (
        <p className="rounded-control bg-sunken px-3 py-2 text-sm text-muted">
          Memory is off for this agent — turn it on in Agent settings.
        </p>
      )}

      <AddFactForm agentId={agent.id} />

      {memories.isPending ? (
        <Spinner label="Loading memory…" />
      ) : memories.isError ? (
        <EmptyState
          title="Couldn't load memory"
          description={errorMessage(memories.error)}
          action={
            <Button variant="secondary" onClick={() => memories.refetch()}>
              Try again
            </Button>
          }
        />
      ) : memories.data.length === 0 ? (
        <EmptyState
          icon={<Brain className="size-5" aria-hidden="true" />}
          title="No memories yet"
          description="Facts this agent saves during runs show up here. Add one yourself to start."
        />
      ) : (
        <MemoryList agentId={agent.id} memories={memories.data} />
      )}

      <Dialog
        open={confirmingClear}
        onOpenChange={setConfirmingClear}
        title={`Clear all memory for ${agent.name}?`}
        description="This removes every fact the agent remembers. This can't be undone."
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmingClear(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmClear} disabled={clear.isPending}>
            {clear.isPending ? 'Clearing…' : 'Clear all'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
