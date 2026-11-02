import type { CheckConfig } from '@agentforgeloop/shared'
import { useState } from 'react'
import { z } from 'zod'
import { Field } from '../../../components/ui/field.tsx'
import { Input } from '../../../components/ui/input.tsx'
import { Select } from '../../../components/ui/select.tsx'
import { Textarea } from '../../../components/ui/textarea.tsx'
import { CodeEditor } from './code-editor.tsx'

type Target = 'input' | 'output'
const TARGET_OPTIONS = [
  { value: 'output', label: 'Output' },
  { value: 'input', label: 'Input' },
]
const SchemaObject = z.record(z.string(), z.unknown())

/** The fields for one check kind. Remounted per kind (see CheckForm). */
export function CheckFields({
  check,
  onChange,
}: {
  check: CheckConfig
  onChange: (check: CheckConfig) => void
}) {
  switch (check.kind) {
    case 'regex':
      return (
        <>
          <Field label="Pattern" htmlFor="check-pattern" hint="A regular expression.">
            <Input
              id="check-pattern"
              className="font-mono"
              spellCheck={false}
              value={check.pattern}
              onChange={(event) => onChange({ ...check, pattern: event.target.value })}
            />
          </Field>
          <Field label="Flags" htmlFor="check-flags">
            <Input
              id="check-flags"
              className="font-mono"
              value={check.flags}
              onChange={(event) => onChange({ ...check, flags: event.target.value })}
            />
          </Field>
          <Field
            label="Mode"
            htmlFor="check-mode"
            hint="Block fails on a match. Require fails without one."
          >
            <Select
              id="check-mode"
              value={check.mode}
              onValueChange={(value) =>
                onChange({ ...check, mode: value === 'require' ? 'require' : 'block' })
              }
              options={[
                { value: 'block', label: 'Block (fail on match)' },
                { value: 'require', label: 'Require (fail on no match)' },
              ]}
            />
          </Field>
          <TargetField value={check.target} onChange={(target) => onChange({ ...check, target })} />
        </>
      )
    case 'json_schema':
      return (
        <>
          <SchemaField
            schema={check.schema}
            onChange={(schema) => onChange({ ...check, schema })}
          />
          <TargetField value={check.target} onChange={(target) => onChange({ ...check, target })} />
        </>
      )
    case 'llm_judge':
      return (
        <>
          <Field label="Rubric" htmlFor="check-rubric" hint="What a passing answer looks like.">
            <Textarea
              id="check-rubric"
              rows={4}
              value={check.rubric}
              onChange={(event) => onChange({ ...check, rubric: event.target.value })}
            />
          </Field>
          <TargetField value={check.target} onChange={(target) => onChange({ ...check, target })} />
        </>
      )
    case 'cost_cap':
      return (
        <Field
          label="Max cost (USD)"
          htmlFor="check-max-usd"
          hint="The run fails above this spend."
        >
          <Input
            id="check-max-usd"
            type="number"
            min={0}
            step={0.01}
            value={check.maxUsd}
            onChange={(event) => {
              const maxUsd = event.target.valueAsNumber
              if (Number.isFinite(maxUsd) && maxUsd > 0) onChange({ ...check, maxUsd })
            }}
          />
        </Field>
      )
    case 'tool_allowlist':
      return <ToolsField tools={check.tools} onChange={(tools) => onChange({ ...check, tools })} />
  }
}

function TargetField({ value, onChange }: { value: Target; onChange: (target: Target) => void }) {
  return (
    <Field label="Applies to" htmlFor="check-target">
      <Select
        id="check-target"
        value={value}
        onValueChange={(next) => onChange(next === 'input' ? 'input' : 'output')}
        options={TARGET_OPTIONS}
      />
    </Field>
  )
}

/** Keeps the text while it is not valid JSON, and saves only a JSON object. */
function SchemaField({
  schema,
  onChange,
}: {
  schema: Record<string, unknown>
  onChange: (schema: Record<string, unknown>) => void
}) {
  const [text, setText] = useState(() => JSON.stringify(schema, null, 2))
  const [error, setError] = useState<string | null>(null)

  const edit = (next: string) => {
    setText(next)
    try {
      const parsed = SchemaObject.safeParse(JSON.parse(next))
      if (parsed.success) {
        setError(null)
        onChange(parsed.data)
      } else {
        setError('This must be a JSON object.')
      }
    } catch {
      setError('Not valid JSON yet. Changes save once it is valid.')
    }
  }

  return (
    <Field label="JSON schema" htmlFor="check-schema">
      <CodeEditor id="check-schema" language="json" height="180px" value={text} onChange={edit} />
      {error && <p className="text-xs text-danger">{error}</p>}
    </Field>
  )
}

/** Keeps commas while typing, so the list is only split when it is read. */
function ToolsField({ tools, onChange }: { tools: string[]; onChange: (tools: string[]) => void }) {
  const [text, setText] = useState(tools.join(', '))
  return (
    <Field
      label="Allowed tools"
      htmlFor="check-tools"
      hint="Comma-separated names. Any other tool use fails the check."
    >
      <Input
        id="check-tools"
        className="font-mono"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          onChange(
            event.target.value
              .split(',')
              .map((name) => name.trim())
              .filter((name) => name.length > 0),
          )
        }}
      />
    </Field>
  )
}
