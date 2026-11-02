import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { errorMessage, useAgent, useDeleteAgent } from '../api/client.ts'
import { Button } from '../components/ui/button.tsx'
import { Dialog } from '../components/ui/dialog.tsx'
import { EmptyState } from '../components/ui/empty-state.tsx'
import { Spinner } from '../components/ui/spinner.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx'
import { useToast } from '../components/ui/toast.tsx'
import { AgentHeader } from '../features/agents/agent-header.tsx'
import { BuildTab } from '../features/canvas/build-tab.tsx'
import { EvalsTab } from '../features/evals/evals-tab.tsx'
import { InsightsTab } from '../features/insights/insights-tab.tsx'
import { MemoryTab } from '../features/memory/memory-tab.tsx'
import { RunConsole, type RunConsoleHandle } from '../features/runs/run-console.tsx'
import { RunsTab } from '../features/runs/runs-tab.tsx'

// Tab panels scroll inside the column that sits above the run console.
const PANEL = 'min-h-0 flex-1 overflow-y-auto p-6'

export function AgentPage() {
  const id = useParams().id ?? ''
  const agent = useAgent(id)
  const remove = useDeleteAgent(id)
  const navigate = useNavigate()
  const toast = useToast()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [publishable, setPublishable] = useState(true)
  const consoleRef = useRef<RunConsoleHandle>(null)

  if (agent.isPending) {
    return (
      <div className="p-6">
        <Spinner label="Loading agent…" />
      </div>
    )
  }

  if (agent.isError) {
    return (
      <div className="p-6">
        <EmptyState
          title="Couldn't load this agent"
          description={errorMessage(agent.error)}
          action={
            <Button variant="secondary" onClick={() => navigate('/')}>
              Back to agents
            </Button>
          }
        />
      </div>
    )
  }

  const current = agent.data
  const confirmDelete = () =>
    remove.mutate(undefined, {
      onSuccess: () => {
        toast(`Deleted ${current.name}`)
        navigate('/')
      },
      onError: (error) => toast(errorMessage(error)),
    })

  return (
    <>
      {/* The page fills the viewport. The drawer is in the column below the tabs, so it takes its
          own height and the tab panel shrinks, instead of covering it. */}
      <div className="flex h-dvh min-h-0 flex-col">
        <Tabs defaultValue="build" className="flex min-h-0 flex-1 flex-col">
          <AgentHeader
            agent={current}
            publishable={publishable}
            onDelete={() => setConfirmingDelete(true)}
            onRun={() => consoleRef.current?.focusInput()}
          />
          <TabsList className="px-6" aria-label="Agent sections">
            <TabsTrigger value="build">Build</TabsTrigger>
            <TabsTrigger value="runs">Runs</TabsTrigger>
            <TabsTrigger value="evals">Evals</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
            <TabsTrigger value="memory">Memory</TabsTrigger>
          </TabsList>

          {/* Kept mounted so the inspector's pending autosave is not interrupted by tab switches. */}
          <TabsContent
            value="build"
            forceMount
            className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 data-[state=inactive]:hidden"
          >
            <BuildTab agent={current} onPublishable={setPublishable} />
          </TabsContent>
          <TabsContent value="runs" className={PANEL}>
            <RunsTab agentId={current.id} />
          </TabsContent>
          <TabsContent value="evals" className={PANEL}>
            <EvalsTab agent={current} />
          </TabsContent>
          <TabsContent value="insights" className={PANEL}>
            <InsightsTab agent={current} />
          </TabsContent>
          <TabsContent value="memory" className={PANEL}>
            <MemoryTab agent={current} />
          </TabsContent>
        </Tabs>

        <RunConsole ref={consoleRef} agent={current} />
      </div>

      <Dialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete ${current.name}?`}
        description="This removes the agent, its versions and its runs. This can't be undone."
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete} disabled={remove.isPending}>
            {remove.isPending ? 'Deleting…' : 'Delete agent'}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
