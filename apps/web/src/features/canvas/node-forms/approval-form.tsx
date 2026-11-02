import type { ApprovalNode } from '@agentforgeloop/shared'
import { Field } from '../../../components/ui/field.tsx'
import { Input } from '../../../components/ui/input.tsx'
import { Select } from '../../../components/ui/select.tsx'

export function ApprovalForm({
  node,
  onChange,
}: {
  node: ApprovalNode
  onChange: (node: ApprovalNode) => void
}) {
  return (
    <>
      <Field label="Message" htmlFor="approval-message" hint="Shown to the person who decides.">
        <Input
          id="approval-message"
          value={node.message}
          onChange={(event) => onChange({ ...node, message: event.target.value })}
        />
      </Field>
      <Field
        label="Timeout (minutes)"
        htmlFor="approval-timeout"
        hint="Leave empty to wait without a time limit."
      >
        <Input
          id="approval-timeout"
          type="number"
          min={1}
          value={node.timeoutMinutes ?? ''}
          onChange={(event) => {
            const minutes = event.target.valueAsNumber
            if (event.target.value === '') onChange({ ...node, timeoutMinutes: undefined })
            else if (Number.isInteger(minutes) && minutes > 0)
              onChange({ ...node, timeoutMinutes: minutes })
          }}
        />
      </Field>
      <Field label="On timeout" htmlFor="approval-on-timeout">
        <Select
          id="approval-on-timeout"
          value={node.onTimeout}
          onValueChange={(value) =>
            onChange({ ...node, onTimeout: value === 'approve' ? 'approve' : 'fail' })
          }
          options={[
            { value: 'fail', label: 'Fail the run' },
            { value: 'approve', label: 'Approve automatically' },
          ]}
        />
      </Field>
    </>
  )
}
