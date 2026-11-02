import type { ConnectionView } from '@agentforgeloop/shared'
import { RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '../../api/client.ts'
import {
  useDeleteConnection,
  useRefreshConnection,
  useUpdateConnection,
} from '../../api/connections.ts'
import { Button } from '../../components/ui/button.tsx'
import { Card } from '../../components/ui/card.tsx'
import { Dialog } from '../../components/ui/dialog.tsx'
import { Switch } from '../../components/ui/switch.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { cn } from '../../lib/cn.ts'

const STATUS_DOTS: Record<ConnectionView['status'], string> = {
  ok: 'bg-active',
  error: 'bg-danger-solid',
  builtin: 'bg-graphite',
}

const STATUS_LABELS: Record<ConnectionView['status'], string> = {
  ok: 'Connected',
  error: "Can't reach the server",
  builtin: 'Always available',
}

/** The MCP server address, or the local command, shown in small mono text. */
function endpoint(connection: ConnectionView): string | null {
  const { config } = connection
  if (!config) return null
  if (config.transport === 'http') return config.url ?? null
  return [config.command, ...config.args].filter(Boolean).join(' ')
}

export function ConnectionCard({ connection }: { connection: ConnectionView }) {
  const toast = useToast()
  const refresh = useRefreshConnection()
  const update = useUpdateConnection(connection.id)
  const remove = useDeleteConnection()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const isMcp = connection.kind === 'mcp'
  const enabledCount = connection.tools.filter((tool) =>
    connection.enabledTools.includes(tool.name),
  ).length
  const toolWord = connection.tools.length === 1 ? 'tool' : 'tools'
  const address = endpoint(connection)

  const setEnabled = (tool: string, on: boolean) => {
    const rest = connection.enabledTools.filter((name) => name !== tool)
    update.mutate(
      { enabledTools: on ? [...rest, tool] : rest },
      { onError: (error) => toast(errorMessage(error)) },
    )
  }

  const confirmDelete = () =>
    remove.mutate(connection.id, {
      onSuccess: () => {
        toast(`Deleted ${connection.name}`)
        setConfirmingDelete(false)
      },
      onError: (error) => toast(errorMessage(error)),
    })

  return (
    <Card className="overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold" title={connection.name}>
              {connection.name}
            </h2>
            <span className="rounded-control border border-line px-1.5 text-xs text-muted">
              {isMcp ? 'MCP' : 'Built-in'}
            </span>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span
              aria-hidden="true"
              className={cn('size-1.5 rounded-full', STATUS_DOTS[connection.status])}
            />
            {STATUS_LABELS[connection.status]}
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {connection.tools.length} {toolWord}, {enabledCount} on
            </span>
          </p>
          {connection.status === 'error' && connection.error && (
            <p className="text-xs break-words text-danger">{connection.error}</p>
          )}
          {address && (
            <p className="truncate font-mono text-xs text-muted" title={address}>
              {address}
            </p>
          )}
        </div>
        {isMcp && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={refresh.isPending}
              onClick={() =>
                refresh.mutate(connection.id, {
                  onSuccess: () => toast(`Refreshed ${connection.name}`),
                  onError: (error) => toast(errorMessage(error)),
                })
              }
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              {refresh.isPending ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
              <Trash2 className="size-3.5" aria-hidden="true" />
              Delete
            </Button>
          </div>
        )}
      </header>

      {connection.tools.length === 0 ? (
        <p className="border-t border-line px-4 py-3 text-sm text-muted">
          This server lists no tools. Refresh to check again.
        </p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {connection.tools.map((tool) => {
            const switchId = `tool-${connection.id}-${tool.name}`
            return (
              <li key={tool.name} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm" title={tool.name}>
                    {tool.name}
                  </p>
                  {tool.description && (
                    <p className="line-clamp-2 text-xs text-muted" title={tool.description}>
                      {tool.description}
                    </p>
                  )}
                </div>
                <label htmlFor={switchId} className="sr-only">
                  Turn on {tool.name}
                </label>
                <Switch
                  id={switchId}
                  checked={connection.enabledTools.includes(tool.name)}
                  onCheckedChange={(on) => setEnabled(tool.name, on)}
                />
              </li>
            )
          })}
        </ul>
      )}

      <Dialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete ${connection.name}?`}
        description="Agents that use its tools will no longer have them. This can't be undone."
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete} disabled={remove.isPending}>
            {remove.isPending ? 'Deleting…' : 'Delete server'}
          </Button>
        </div>
      </Dialog>
    </Card>
  )
}
