import type { TriggerView } from '@agentforgeloop/shared'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '../../api/client.ts'
import { useCreateTrigger, useTriggers } from '../../api/triggers.ts'
import { Button } from '../../components/ui/button.tsx'
import { Dialog } from '../../components/ui/dialog.tsx'
import { EmptyState } from '../../components/ui/empty-state.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Select } from '../../components/ui/select.tsx'
import { Spinner } from '../../components/ui/spinner.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { ScheduleForm } from './schedule-form.tsx'
import { TriggerList } from './trigger-list.tsx'
import { WebhookDetails } from './webhook-details.tsx'

export function TriggerDialog({
  agentId,
  open,
  onOpenChange,
}: {
  agentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Triggers"
      description="What starts a run. Run in the header always works."
    >
      {/* The panel lives inside the dialog content, so its view resets each time it opens. */}
      <TriggerPanel agentId={agentId} onDone={() => onOpenChange(false)} />
    </Dialog>
  )
}

type View = { name: 'list' } | { name: 'add' } | { name: 'webhook'; trigger: TriggerView }

function TriggerPanel({ agentId, onDone }: { agentId: string; onDone: () => void }) {
  const toast = useToast()
  const triggers = useTriggers(agentId)
  const create = useCreateTrigger(agentId)
  const [view, setView] = useState<View>({ name: 'list' })
  const [kind, setKind] = useState<'schedule' | 'webhook'>('schedule')
  const back = () => setView({ name: 'list' })

  if (view.name === 'webhook') {
    return <WebhookDetails trigger={view.trigger} onDone={back} />
  }

  if (view.name === 'add') {
    return (
      <div className="space-y-4">
        <Field label="Type" htmlFor="trigger-type">
          <Select
            id="trigger-type"
            value={kind}
            onValueChange={(value) => setKind(value === 'webhook' ? 'webhook' : 'schedule')}
            options={[
              { value: 'schedule', label: 'Scheduled' },
              { value: 'webhook', label: 'Webhook' },
            ]}
          />
        </Field>
        {kind === 'schedule' ? (
          <ScheduleForm
            pending={create.isPending}
            onCancel={back}
            onSubmit={(cron, timezone) =>
              create.mutate(
                { kind: 'schedule', cron, timezone },
                {
                  onSuccess: () => {
                    toast('Schedule added')
                    back()
                  },
                  onError: (error) => toast(errorMessage(error)),
                },
              )
            }
          />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              A webhook starts a run each time another system sends a POST to its URL.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={back}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={create.isPending}
                onClick={() =>
                  create.mutate(
                    { kind: 'webhook' },
                    {
                      onSuccess: (trigger) => setView({ name: 'webhook', trigger }),
                      onError: (error) => toast(errorMessage(error)),
                    },
                  )
                }
              >
                {create.isPending ? 'Creating…' : 'Create webhook'}
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Loading and failure are shown as such, never as an empty list (which would invite duplicates).
  if (triggers.isPending) return <Spinner label="Loading triggers…" />
  if (triggers.isError) {
    return <EmptyState title="Couldn't load triggers" description={errorMessage(triggers.error)} />
  }

  return (
    <div className="space-y-4">
      <TriggerList agentId={agentId} triggers={triggers.data} />
      <div className="flex justify-between gap-2 pt-1">
        <Button variant="secondary" onClick={() => setView({ name: 'add' })}>
          <Plus className="size-4" aria-hidden="true" />
          Add trigger
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  )
}
