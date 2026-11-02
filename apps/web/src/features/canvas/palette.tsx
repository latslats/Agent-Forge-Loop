import { NODE_TYPES, type NodeType } from '@agentforgeloop/shared'
import { NODE_DRAG_TYPE, NODE_INFO } from './node-info.ts'

/** Drag a node type onto the canvas, or click to add it after the last node. */
export function Palette({
  hasTrigger,
  onAdd,
}: {
  hasTrigger: boolean
  onAdd: (type: NodeType) => void
}) {
  const types = NODE_TYPES.filter((type) => !(hasTrigger && type === 'trigger'))
  return (
    <section aria-labelledby="palette-heading" className="space-y-3">
      <div>
        <h2 id="palette-heading" className="text-sm font-semibold">
          Nodes
        </h2>
        <p className="text-xs text-muted">Drag onto the canvas, or click to add.</p>
      </div>
      <ul className="space-y-2">
        {types.map((type) => {
          const { label, hint, icon: Icon } = NODE_INFO[type]
          return (
            <li key={type}>
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(NODE_DRAG_TYPE, type)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onClick={() => onAdd(type)}
                className="flex w-full cursor-grab gap-3 rounded-control border border-line bg-panel p-2.5 text-left transition-colors duration-150 hover:border-graphite active:cursor-grabbing"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-control bg-sunken text-muted">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
