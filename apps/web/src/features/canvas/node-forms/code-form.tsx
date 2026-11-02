import type { CodeNode } from '@agentforgeloop/shared'
import { Field } from '../../../components/ui/field.tsx'
import { CodeEditor } from './code-editor.tsx'

export function CodeForm({
  node,
  onChange,
}: {
  node: CodeNode
  onChange: (node: CodeNode) => void
}) {
  return (
    <Field
      label="Code"
      htmlFor="code-source"
      hint="input, vars and prev are in scope; return the new result."
    >
      <CodeEditor
        id="code-source"
        language="javascript"
        height="220px"
        value={node.source}
        onChange={(source) => onChange({ ...node, source })}
      />
    </Field>
  )
}
