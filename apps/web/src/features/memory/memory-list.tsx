import type { Memory } from '@agentforgeloop/shared'
import { Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { errorMessage } from '../../api/client.ts'
import { useDeleteMemory } from '../../api/memory.ts'
import { Button } from '../../components/ui/button.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { timeAgo } from '../../lib/format.ts'

export function MemoryList({ agentId, memories }: { agentId: string; memories: Memory[] }) {
  const toast = useToast()
  const remove = useDeleteMemory(agentId)

  return (
    <ul className="divide-y divide-line rounded-control border border-line">
      {memories.map((memory) => (
        <li key={memory.id} className="flex items-start gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm break-words whitespace-pre-wrap">{memory.content}</p>
            <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
              <span className="tabular-nums">{timeAgo(memory.createdAt)}</span>
              {memory.sourceRunId && (
                <>
                  <span aria-hidden="true">·</span>
                  <Link
                    to={`/runs/${memory.sourceRunId}`}
                    className="text-accent-ink hover:underline"
                  >
                    from run
                  </Link>
                </>
              )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Delete fact"
            className="px-2"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(memory.id, { onError: (error) => toast(errorMessage(error)) })
            }
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  )
}
