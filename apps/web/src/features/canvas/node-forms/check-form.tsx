import type { CheckConfig, CheckNode } from '@agentforgeloop/shared'
import { z } from 'zod'
import { Field } from '../../../components/ui/field.tsx'
import { Select } from '../../../components/ui/select.tsx'
import { CheckFields } from './check-fields.tsx'

type CheckKind = CheckConfig['kind']

const KIND_OPTIONS: { value: CheckKind; label: string }[] = [
  { value: 'regex', label: 'Regex' },
  { value: 'json_schema', label: 'JSON schema' },
  { value: 'llm_judge', label: 'LLM judge' },
  { value: 'cost_cap', label: 'Cost cap' },
  { value: 'tool_allowlist', label: 'Tool allowlist' },
]
const KindValue = z.enum(['regex', 'json_schema', 'llm_judge', 'cost_cap', 'tool_allowlist'])

/** A fresh config for a check kind. Switching kind replaces the old config. */
function defaultCheck(kind: CheckKind): CheckConfig {
  switch (kind) {
    case 'regex':
      return { kind, pattern: '', flags: 'i', mode: 'block', target: 'output' }
    case 'json_schema':
      return { kind, schema: {}, target: 'output' }
    case 'llm_judge':
      return { kind, rubric: '', target: 'output' }
    case 'cost_cap':
      return { kind, maxUsd: 0.5 }
    case 'tool_allowlist':
      return { kind, tools: [] }
  }
}

export function CheckForm({
  node,
  onChange,
}: {
  node: CheckNode
  onChange: (node: CheckNode) => void
}) {
  const setCheck = (check: CheckConfig) => onChange({ ...node, check })
  return (
    <>
      <Field label="Check type" htmlFor="check-kind">
        <Select
          id="check-kind"
          value={node.check.kind}
          onValueChange={(value) => {
            const parsed = KindValue.safeParse(value)
            if (parsed.success) setCheck(defaultCheck(parsed.data))
          }}
          options={KIND_OPTIONS}
        />
      </Field>
      <CheckFields key={node.check.kind} check={node.check} onChange={setCheck} />
      <Field
        label="When it fails"
        htmlFor="check-on-fail"
        hint={
          node.onFail === 'route'
            ? 'The run follows the fail edge.'
            : 'The run stops with an error.'
        }
      >
        <Select
          id="check-on-fail"
          value={node.onFail}
          onValueChange={(value) =>
            onChange({ ...node, onFail: value === 'route' ? 'route' : 'stop' })
          }
          options={[
            { value: 'stop', label: 'Stop the run' },
            { value: 'route', label: 'Follow the fail edge' },
          ]}
        />
      </Field>
    </>
  )
}
