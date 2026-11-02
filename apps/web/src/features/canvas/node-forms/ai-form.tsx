import { type AiNode, Effort, MODEL_IDS, MODEL_LABELS, ModelId } from '@agentforgeloop/shared'
import { Field } from '../../../components/ui/field.tsx'
import { Input } from '../../../components/ui/input.tsx'
import { Select } from '../../../components/ui/select.tsx'
import { CodeEditor } from './code-editor.tsx'
import { ToolPicker } from './tool-picker.tsx'

const INHERIT = 'inherit'
const MODEL_OPTIONS = [
  { value: INHERIT, label: 'Inherit (agent default)' },
  ...MODEL_IDS.map((id) => ({ value: id, label: MODEL_LABELS[id] })),
]
const EFFORT_LABELS: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High' }
const EFFORT_OPTIONS = [
  { value: INHERIT, label: 'Inherit (agent default)' },
  ...Effort.options.map((value) => ({ value, label: EFFORT_LABELS[value] })),
]

export function AiForm({ node, onChange }: { node: AiNode; onChange: (node: AiNode) => void }) {
  return (
    <>
      <Field label="Prompt" htmlFor="ai-prompt" hint="What this step asks the model to do.">
        <CodeEditor
          id="ai-prompt"
          language="markdown"
          height="220px"
          value={node.prompt}
          onChange={(prompt) => onChange({ ...node, prompt })}
        />
      </Field>
      <Field label="Model" htmlFor="ai-model">
        <Select
          id="ai-model"
          value={node.model ?? INHERIT}
          onValueChange={(value) => {
            const parsed = ModelId.safeParse(value)
            onChange({ ...node, model: parsed.success ? parsed.data : undefined })
          }}
          options={MODEL_OPTIONS}
        />
      </Field>
      <Field label="Effort" htmlFor="ai-effort">
        <Select
          id="ai-effort"
          value={node.effort ?? INHERIT}
          onValueChange={(value) => {
            const parsed = Effort.safeParse(value)
            onChange({ ...node, effort: parsed.success ? parsed.data : undefined })
          }}
          options={EFFORT_OPTIONS}
        />
      </Field>
      <Field
        label="Max turns"
        htmlFor="ai-max-turns"
        hint="Model calls allowed in one step (1 to 50)."
      >
        <Input
          id="ai-max-turns"
          type="number"
          min={1}
          max={50}
          value={node.maxTurns}
          onChange={(event) => {
            const turns = event.target.valueAsNumber
            if (Number.isInteger(turns) && turns >= 1 && turns <= 50) {
              onChange({ ...node, maxTurns: turns })
            }
          }}
        />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted">Tools</legend>
        <ToolPicker value={node.tools} onChange={(tools) => onChange({ ...node, tools })} />
      </fieldset>
    </>
  )
}
