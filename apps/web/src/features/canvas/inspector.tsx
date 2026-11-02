import { AgentSettings } from './agent-settings.tsx'
import { NodeInspector } from './node-inspector.tsx'
import type { DefinitionEditor } from './use-definition.ts'

/** The selected node's settings, or the agent settings when nothing is selected. */
export function Inspector({ editor }: { editor: DefinitionEditor }) {
  const { selectedNode } = editor
  if (selectedNode) {
    return (
      <NodeInspector
        key={selectedNode.id}
        node={selectedNode}
        onChange={editor.updateNode}
        onDelete={editor.deleteSelected}
      />
    )
  }
  return <AgentSettings definition={editor.definition} onChange={editor.updateAgent} />
}
