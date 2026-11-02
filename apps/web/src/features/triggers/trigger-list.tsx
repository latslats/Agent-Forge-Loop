import type { TriggerView } from '@agentforgeloop/shared'
import { Trash } from 'lucide-react'
import { errorMessage } from '../../api/client.ts'
import { useDeleteTrigger, useUpdateTrigger } from '../../api/triggers.ts'
import { Button } from '../../components/ui/button.tsx'
import { Switch } from '../../components/ui/switch.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { describeCron } from './schedule.ts'

// One row per trigger. The plain summary leads; the cron or webhook path follows in small type.
export function TriggerList({ agentId, triggers }: { agentId: string; triggers: TriggerView[] }) {
  const toast = useToast()
  const update = useUpdateTrigger(agentId)
  const remove = useDeleteTrigger(agentId)

  if (triggers.length === 0) {
    return (
      <p className="text-sm text-muted">Nothing starts this agent yet. Run starts it by hand.</p>
    )
  }

  return (
    <ul className="divide-y divide-line rounded-control border border-line">
      {triggers.map((trigger) => {
        const { config } = trigger
        const summary =
          config.kind === 'schedule' ? describeCron(config.cron, config.timezone) : 'Webhook'
        const detail = config.kind === 'schedule' ? config.cron : trigger.webhookUrl
        return (
          <li key={trigger.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={summary}>
                {summary}
              </p>
              <p className="truncate font-mono text-xs text-muted" title={detail ?? undefined}>
                {detail}
              </p>
            </div>
            <label htmlFor={`trigger-on-${trigger.id}`} className="sr-only">
              Turn on {summary}
            </label>
            <Switch
              id={`trigger-on-${trigger.id}`}
              checked={trigger.enabled}
              onCheckedChange={(enabled) =>
                update.mutate(
                  { id: trigger.id, body: { enabled } },
                  { onError: (error) => toast(errorMessage(error)) },
                )
              }
            />
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Delete ${summary}`}
              className="px-2"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(trigger.id, {
                  onSuccess: () => toast('Trigger deleted'),
                  onError: (error) => toast(errorMessage(error)),
                })
              }
            >
              <Trash className="size-4" aria-hidden="true" />
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
