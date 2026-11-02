import type { AgentWithVersions } from '@agentforgeloop/shared'
import { CalendarClock } from 'lucide-react'
import { useState } from 'react'
import { useTriggers } from '../../api/triggers.ts'
import { Badge } from '../../components/ui/badge.tsx'
import { summarizeTriggers } from './schedule.ts'
import { TriggerDialog } from './trigger-dialog.tsx'

// The header chip summarises the agent's triggers and opens the Triggers dialog.
export function TriggerChip({ agent }: { agent: AgentWithVersions }) {
  const [open, setOpen] = useState(false)
  const triggers = useTriggers(agent.id)
  const summary = triggers.data
    ? summarizeTriggers(triggers.data)
    : triggers.isError
      ? 'Triggers unavailable'
      : 'Loading…'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Triggers: ${summary}. Edit triggers`}
        className="cursor-pointer rounded-control transition-[filter] duration-150 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Badge>
          <CalendarClock className="size-3.5" aria-hidden="true" />
          {summary}
        </Badge>
      </button>
      <TriggerDialog agentId={agent.id} open={open} onOpenChange={setOpen} />
    </>
  )
}
