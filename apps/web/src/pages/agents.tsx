import { Bot, Plus } from 'lucide-react'
import { useState } from 'react'
import { errorMessage, useAgents } from '../api/client.ts'
import { PageHeader } from '../components/layout/page-header.tsx'
import { Button } from '../components/ui/button.tsx'
import { EmptyState } from '../components/ui/empty-state.tsx'
import { Spinner } from '../components/ui/spinner.tsx'
import { AgentCard } from '../features/agents/agent-card.tsx'
import { NewAgentDialog } from '../features/agents/new-agent-dialog.tsx'

export function AgentsPage() {
  const agents = useAgents()
  const [creating, setCreating] = useState(false)
  const newAgent = (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <Plus className="size-4" aria-hidden="true" />
      New agent
    </Button>
  )

  return (
    <>
      <PageHeader
        title="Agents"
        description="Build, run and check AI agents on a canvas."
        actions={newAgent}
      />
      <div className="p-6">
        {agents.isPending && <Spinner label="Loading agents…" />}
        {agents.isError && (
          <EmptyState
            title="Couldn't load agents"
            description={errorMessage(agents.error)}
            action={
              <Button variant="secondary" onClick={() => agents.refetch()}>
                Try again
              </Button>
            }
          />
        )}
        {agents.isSuccess && agents.data.length === 0 && (
          <EmptyState
            icon={<Bot className="size-5" aria-hidden="true" />}
            title="No agents yet"
            description="Create an agent, then draft its steps on the canvas."
            action={newAgent}
          />
        )}
        {agents.isSuccess && agents.data.length > 0 && (
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {agents.data.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </ul>
        )}
      </div>
      <NewAgentDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}
