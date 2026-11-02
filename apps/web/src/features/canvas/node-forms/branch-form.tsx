import type { BranchNode } from '@agentforgeloop/shared'
import { Field } from '../../../components/ui/field.tsx'
import { Input } from '../../../components/ui/input.tsx'

export function BranchForm({
  node,
  onChange,
}: {
  node: BranchNode
  onChange: (node: BranchNode) => void
}) {
  return (
    <Field
      label="Condition"
      htmlFor="branch-expression"
      hint="A JavaScript expression. input, vars and prev are in scope. The true and false handles pick the next step."
    >
      <Input
        id="branch-expression"
        className="font-mono"
        spellCheck={false}
        value={node.expression}
        onChange={(event) => onChange({ ...node, expression: event.target.value })}
      />
    </Field>
  )
}
