import type { OutputNode } from '@agentforgeloop/shared'
import { Field } from '../../../components/ui/field.tsx'
import { Textarea } from '../../../components/ui/textarea.tsx'

export function OutputForm({
  node,
  onChange,
}: {
  node: OutputNode
  onChange: (node: OutputNode) => void
}) {
  return (
    <Field
      label="Template"
      htmlFor="output-template"
      hint="Leave empty to pass the result through. Use {{prev.reply}} to insert a field."
    >
      <Textarea
        id="output-template"
        rows={4}
        spellCheck={false}
        className="font-mono"
        value={node.template}
        onChange={(event) => onChange({ ...node, template: event.target.value })}
      />
    </Field>
  )
}
