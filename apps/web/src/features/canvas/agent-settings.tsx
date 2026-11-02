import {
  type AgentDefinition,
  Effort,
  MODEL_IDS,
  MODEL_LABELS,
  ModelId,
} from '@agentforgeloop/shared'
import { Field } from '../../components/ui/field.tsx'
import { Select } from '../../components/ui/select.tsx'
import { Switch } from '../../components/ui/switch.tsx'
import { Textarea } from '../../components/ui/textarea.tsx'

const MODEL_OPTIONS = MODEL_IDS.map((id) => ({ value: id, label: MODEL_LABELS[id] }))
const EFFORT_LABELS: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High' }
const EFFORT_OPTIONS = Effort.options.map((value) => ({ value, label: EFFORT_LABELS[value] }))

/** Agent-wide settings, shown when no node is selected. Edits go to the shared draft. */
export function AgentSettings({
  definition,
  onChange,
}: {
  definition: AgentDefinition
  onChange: (patch: Partial<AgentDefinition>) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-sm font-semibold">Agent settings</h2>
      <Field label="Description" htmlFor="agent-description">
        <Textarea
          id="agent-description"
          rows={3}
          placeholder="What this agent does, in a sentence or two."
          value={definition.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </Field>
      <Field label="Model" htmlFor="agent-model">
        <Select
          id="agent-model"
          value={definition.model}
          onValueChange={(value) => {
            const parsed = ModelId.safeParse(value)
            if (parsed.success) onChange({ model: parsed.data })
          }}
          options={MODEL_OPTIONS}
        />
      </Field>
      <Field label="Effort" htmlFor="agent-effort">
        <Select
          id="agent-effort"
          value={definition.effort}
          onValueChange={(value) => {
            const parsed = Effort.safeParse(value)
            if (parsed.success) onChange({ effort: parsed.data })
          }}
          options={EFFORT_OPTIONS}
        />
      </Field>
      <Field
        label="Principles"
        htmlFor="agent-principles"
        hint="Markdown rules the agent follows on every step."
      >
        <Textarea
          id="agent-principles"
          rows={10}
          placeholder="- Never repeat card numbers."
          spellCheck={false}
          className="font-mono"
          value={definition.principles}
          onChange={(event) => onChange({ principles: event.target.value })}
        />
      </Field>
      <div className="flex items-start justify-between gap-3">
        <div>
          <label htmlFor="agent-memory" className="block text-sm font-medium">
            Memory
          </label>
          <p className="text-xs text-muted">Let the agent remember facts from past runs.</p>
        </div>
        <Switch
          id="agent-memory"
          checked={definition.memory.enabled}
          onCheckedChange={(enabled) => onChange({ memory: { enabled } })}
        />
      </div>
    </div>
  )
}
