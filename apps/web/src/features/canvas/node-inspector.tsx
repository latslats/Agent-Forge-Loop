import type { Node as DefNode } from '@agentforgeloop/shared'
import { Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/button.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input } from '../../components/ui/input.tsx'
import { AiForm } from './node-forms/ai-form.tsx'
import { ApprovalForm } from './node-forms/approval-form.tsx'
import { BranchForm } from './node-forms/branch-form.tsx'
import { CheckForm } from './node-forms/check-form.tsx'
import { CodeForm } from './node-forms/code-form.tsx'
import { OutputForm } from './node-forms/output-form.tsx'
import { NODE_INFO } from './node-info.ts'

type Change = (node: DefNode) => void

/** Settings for the selected node: its label, its kind's fields, and Delete. */
export function NodeInspector({
  node,
  onChange,
  onDelete,
}: {
  node: DefNode
  onChange: Change
  onDelete: () => void
}) {
  const info = NODE_INFO[node.type]
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-sm font-semibold">{info.label}</h2>
        <p className="text-xs text-muted">{info.hint}</p>
      </div>
      <Field label="Label" htmlFor="node-label">
        <Input
          id="node-label"
          value={node.label}
          onChange={(event) => onChange({ ...node, label: event.target.value })}
        />
      </Field>
      <NodeForm node={node} onChange={onChange} />
      <div className="border-t border-line pt-4">
        <Button variant="danger" size="sm" onClick={onDelete}>
          <Trash2 className="size-4" aria-hidden="true" />
          Delete node
        </Button>
      </div>
    </div>
  )
}

function NodeForm({ node, onChange }: { node: DefNode; onChange: Change }) {
  switch (node.type) {
    case 'trigger':
      return <p className="text-xs text-muted">Each agent has exactly one trigger.</p>
    case 'ai':
      return <AiForm node={node} onChange={onChange} />
    case 'code':
      return <CodeForm node={node} onChange={onChange} />
    case 'check':
      return <CheckForm node={node} onChange={onChange} />
    case 'approval':
      return <ApprovalForm node={node} onChange={onChange} />
    case 'branch':
      return <BranchForm node={node} onChange={onChange} />
    case 'output':
      return <OutputForm node={node} onChange={onChange} />
  }
}
