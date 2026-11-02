import { useNavigate } from 'react-router'
import { errorMessage } from '../../api/client.ts'
import { useCreateFromTemplate, useTemplates } from '../../api/draft.ts'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card } from '../../components/ui/card.tsx'
import { Spinner } from '../../components/ui/spinner.tsx'
import { useToast } from '../../components/ui/toast.tsx'

/** Built-in starting points. Each one is created already published as v1, then opened. */
export function TemplateAgentList({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const templates = useTemplates()
  const create = useCreateFromTemplate()

  const use = (id: string, name: string) =>
    create.mutate(
      { id },
      {
        onSuccess: (agent) => {
          toast(`Created ${name}`)
          onDone()
          navigate(`/agents/${agent.id}`)
        },
        onError: (error) => toast(errorMessage(error)),
      },
    )

  if (templates.isPending) return <Spinner label="Loading templates…" />
  if (templates.isError) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-danger">
          {errorMessage(templates.error)}
        </p>
        <Button variant="secondary" onClick={() => templates.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <ul className="space-y-2.5">
      {templates.data.map((template) => (
        <li key={template.id}>
          <Card className="flex items-start justify-between gap-4 p-3.5">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold tracking-tight">{template.name}</h3>
              <p className="mt-1 text-sm text-muted">{template.description}</p>
              <div className="mt-2 flex gap-1.5">
                <Badge>{template.category}</Badge>
                <Badge className="tabular-nums">{template.nodeCount} steps</Badge>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              disabled={create.isPending}
              onClick={() => use(template.id, template.name)}
            >
              {create.isPending && create.variables?.id === template.id
                ? 'Creating…'
                : 'Use template'}
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  )
}
