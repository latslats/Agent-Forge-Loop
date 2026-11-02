import type { ConnectionView } from '@agentforgeloop/shared'
import { type FormEvent, useState } from 'react'
import { errorMessage } from '../../api/client.ts'
import { useCreateConnection } from '../../api/connections.ts'
import { Button } from '../../components/ui/button.tsx'
import { Dialog } from '../../components/ui/dialog.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input } from '../../components/ui/input.tsx'
import { Select } from '../../components/ui/select.tsx'
import { Textarea } from '../../components/ui/textarea.tsx'
import { buildMcpConfig, type ServerDraft } from './server-config.ts'

const TRANSPORT_OPTIONS = [
  { value: 'http', label: 'HTTP' },
  { value: 'stdio', label: 'stdio (local command)' },
]

export function AddServerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add MCP server"
      description="Connect a server over HTTP, or start one on this machine with a command."
    >
      {/* Radix unmounts the dialog content on close, so the form starts empty each time. */}
      <AddServerForm onDone={() => onOpenChange(false)} />
    </Dialog>
  )
}

function AddServerForm({ onDone }: { onDone: () => void }) {
  const create = useCreateConnection()
  const [name, setName] = useState('')
  const [draft, setDraft] = useState<ServerDraft>({
    transport: 'http',
    url: '',
    command: '',
    args: '',
    env: '',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [connected, setConnected] = useState<ConnectionView | null>(null)

  const patch = (next: Partial<ServerDraft>) => setDraft((current) => ({ ...current, ...next }))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '') {
      setFormError('Give the server a name.')
      return
    }
    const built = buildMcpConfig(draft)
    if (!built.ok) {
      setFormError(built.error)
      return
    }
    setFormError(null)
    create.mutate(
      { name: trimmed, config: built.config },
      {
        onSuccess: (connection) => setConnected(connection),
        // A 502 carries the server's own reason, which errorMessage shows as is.
        onError: (error) => setFormError(errorMessage(error)),
      },
    )
  }

  if (connected) {
    const toolCount = connected.tools.length
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Connected to <span className="font-medium">{connected.name}</span>. {toolCount}{' '}
          {toolCount === 1 ? 'tool' : 'tools'} found.
        </p>
        {toolCount > 0 && (
          <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-control border border-line">
            {connected.tools.map((tool) => (
              <li key={tool.name} className="px-3 py-2">
                <p className="font-mono text-sm">{tool.name}</p>
                {tool.description && <p className="text-xs text-muted">{tool.description}</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">Tools start off. Switch on the ones agents may use.</p>
        <div className="flex justify-end">
          <Button variant="primary" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name" htmlFor="server-name">
        <Input
          id="server-name"
          placeholder="Docs search"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Transport" htmlFor="server-transport">
        <Select
          id="server-transport"
          value={draft.transport}
          onValueChange={(value) => patch({ transport: value === 'stdio' ? 'stdio' : 'http' })}
          options={TRANSPORT_OPTIONS}
        />
      </Field>
      {draft.transport === 'http' ? (
        <Field label="URL" htmlFor="server-url">
          <Input
            id="server-url"
            placeholder="https://example.com/mcp"
            value={draft.url}
            onChange={(event) => patch({ url: event.target.value })}
          />
        </Field>
      ) : (
        <>
          <Field label="Command" htmlFor="server-command">
            <Input
              id="server-command"
              placeholder="npx"
              value={draft.command}
              onChange={(event) => patch({ command: event.target.value })}
            />
          </Field>
          <Field label="Arguments" htmlFor="server-args" hint="One per line.">
            <Textarea
              id="server-args"
              rows={3}
              spellCheck={false}
              className="font-mono"
              value={draft.args}
              onChange={(event) => patch({ args: event.target.value })}
            />
          </Field>
          <Field label="Environment" htmlFor="server-env" hint="KEY=value, one per line.">
            <Textarea
              id="server-env"
              rows={3}
              spellCheck={false}
              className="font-mono"
              value={draft.env}
              onChange={(event) => patch({ env: event.target.value })}
            />
          </Field>
        </>
      )}
      {formError && (
        <p role="alert" className="text-sm break-words text-danger">
          {formError}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {create.isPending ? 'Connecting…' : 'Connect'}
        </Button>
      </div>
    </form>
  )
}
