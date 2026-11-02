import { BUILTIN_CONNECTION_ID, type ToolRef } from '@agentforgeloop/shared'
import { Link } from 'react-router'
import { errorMessage } from '../../../api/client.ts'
import { useConnections } from '../../../api/connections.ts'
import { Spinner } from '../../../components/ui/spinner.tsx'

/** Checkboxes for the tools an AI step may use: enabled tools only, grouped by connection. */
export function ToolPicker({
  value,
  onChange,
}: {
  value: ToolRef[]
  onChange: (tools: ToolRef[]) => void
}) {
  const connections = useConnections()

  if (connections.isPending) return <Spinner label="Loading tools…" />
  if (connections.isError) {
    return <p className="text-xs break-words text-danger">{errorMessage(connections.error)}</p>
  }

  const groups = connections.data
    .map((connection) => ({
      connection,
      tools: connection.tools.filter((tool) => connection.enabledTools.includes(tool.name)),
    }))
    .filter((group) => group.tools.length > 0)

  const hasTool = (connectionId: string, tool: string) =>
    value.some((ref) => ref.connectionId === connectionId && ref.tool === tool)

  const setTool = (connectionId: string, tool: string, on: boolean) => {
    const rest = value.filter((ref) => !(ref.connectionId === connectionId && ref.tool === tool))
    onChange(on ? [...rest, { connectionId, tool }] : rest)
  }

  // Saved tools that are no longer listed (disabled, server removed or in error). They stay
  // visible, checked, so the user can uncheck them.
  const unavailable = value.filter(
    (ref) =>
      !groups.some(
        ({ connection, tools }) =>
          connection.id === ref.connectionId && tools.some((tool) => tool.name === ref.tool),
      ),
  )

  return (
    <div className="space-y-3">
      {groups.map(({ connection, tools }) => (
        <fieldset key={connection.id} className="space-y-1.5">
          <legend className="text-xs text-muted">
            {connection.id === BUILTIN_CONNECTION_ID ? 'Built-in' : connection.name}
          </legend>
          {tools.map((tool) => (
            <label key={tool.name} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-(--color-accent)"
                checked={hasTool(connection.id, tool.name)}
                onChange={(event) => setTool(connection.id, tool.name, event.target.checked)}
              />
              <span className="truncate font-mono text-[13px]" title={tool.name}>
                {tool.name}
              </span>
            </label>
          ))}
        </fieldset>
      ))}
      {unavailable.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-xs text-muted">Unavailable</legend>
          {unavailable.map((ref) => (
            <label
              key={`${ref.connectionId}/${ref.tool}`}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                className="size-4 accent-(--color-accent)"
                checked
                onChange={(event) => setTool(ref.connectionId, ref.tool, event.target.checked)}
              />
              <span className="truncate font-mono text-[13px]">
                {ref.connectionId}/{ref.tool} (unavailable)
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <p className="text-xs text-muted">
        {groups.length === 0 && unavailable.length === 0 ? 'No tools are enabled yet. ' : ''}
        <Link to="/connections" className="text-accent-ink hover:underline">
          Enable more on the Connections page
        </Link>
      </p>
    </div>
  )
}
