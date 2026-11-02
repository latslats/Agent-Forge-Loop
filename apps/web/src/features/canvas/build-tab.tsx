import type { Agent } from '@agentforgeloop/shared'
import { ReactFlowProvider } from '@xyflow/react'
import { useEffect } from 'react'
import { Canvas } from './canvas.tsx'
import { Inspector } from './inspector.tsx'
import { Palette } from './palette.tsx'
import { ProblemsBanner } from './problems-banner.tsx'
import { type SaveStatus, useDefinition } from './use-definition.ts'

const STATUS_LABELS: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: "Couldn't save",
  invalid: 'Not saved yet',
}

/**
 * The Build tab: palette, canvas and inspector. Remounted per agent so the draft resets.
 * `onPublishable` tells the page whether the saved draft is up to date, so Publish can wait.
 */
export function BuildTab({
  agent,
  onPublishable,
}: {
  agent: Agent
  onPublishable: (publishable: boolean) => void
}) {
  return <BuildPanel key={agent.id} agent={agent} onPublishable={onPublishable} />
}

function BuildPanel({
  agent,
  onPublishable,
}: {
  agent: Agent
  onPublishable: (publishable: boolean) => void
}) {
  const editor = useDefinition(agent)
  const publishable = editor.status === 'idle' || editor.status === 'saved'
  useEffect(() => {
    onPublishable(publishable)
  }, [publishable, onPublishable])
  return (
    <div className="grid flex-none grid-cols-1 divide-y divide-line overflow-hidden rounded-surface border border-line bg-panel xl:min-h-0 xl:flex-1 xl:grid-cols-[220px_minmax(0,1fr)_320px] xl:divide-x xl:divide-y-0">
      <div className="min-h-0 overflow-y-auto p-4">
        <Palette hasTrigger={editor.hasTrigger} onAdd={(type) => editor.addNode(type)} />
      </div>
      <div className="flex min-h-[520px] min-w-0 flex-col gap-3 p-4 xl:min-h-0">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <ProblemsBanner problems={editor.problemList} />
          </div>
          <p role="status" className="shrink-0 pt-2 text-xs text-muted tabular-nums">
            {STATUS_LABELS[editor.status]}
          </p>
        </div>
        <div className="relative min-h-[440px] flex-1 overflow-hidden rounded-control border border-line xl:min-h-0">
          <ReactFlowProvider>
            <Canvas
              agentId={agent.id}
              nodes={editor.flowNodes}
              edges={editor.flowEdges}
              onNodesChange={editor.onNodesChange}
              onEdgesChange={editor.onEdgesChange}
              onConnect={editor.onConnect}
              onAddNode={editor.addNode}
            />
          </ReactFlowProvider>
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto p-4">
        <Inspector editor={editor} />
      </div>
    </div>
  )
}
