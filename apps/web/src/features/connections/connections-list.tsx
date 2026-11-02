import { Plug, Plus } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '../../api/client.ts'
import { useConnections } from '../../api/connections.ts'
import { Button } from '../../components/ui/button.tsx'
import { EmptyState } from '../../components/ui/empty-state.tsx'
import { Spinner } from '../../components/ui/spinner.tsx'
import { AddServerDialog } from './add-server-dialog.tsx'
import { ConnectionCard } from './connection-card.tsx'

/** The Connections page body: the built-in card, one card per MCP server, and Add MCP server. */
export function ConnectionsList() {
  const connections = useConnections()
  const [adding, setAdding] = useState(false)
  const addButton = (
    <Button variant="primary" onClick={() => setAdding(true)}>
      <Plus className="size-4" aria-hidden="true" />
      Add MCP server
    </Button>
  )

  if (connections.isPending) return <Spinner label="Loading connections…" />

  if (connections.isError) {
    return (
      <EmptyState
        title="Couldn't load connections"
        description={errorMessage(connections.error)}
        action={
          <Button variant="secondary" onClick={() => connections.refetch()}>
            Try again
          </Button>
        }
      />
    )
  }

  const hasServers = connections.data.some((connection) => connection.kind === 'mcp')
  return (
    <div className="space-y-4">
      <div className="flex justify-end">{addButton}</div>
      {connections.data.map((connection) => (
        <ConnectionCard key={connection.id} connection={connection} />
      ))}
      {!hasServers && (
        <EmptyState
          icon={<Plug className="size-5" aria-hidden="true" />}
          title="No MCP servers yet"
          description="Connect a server over HTTP or start one on this machine. Its tools then show up here."
          action={addButton}
        />
      )}
      <AddServerDialog open={adding} onOpenChange={setAdding} />
    </div>
  )
}
