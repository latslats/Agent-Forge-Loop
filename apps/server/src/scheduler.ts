import { Cron } from 'croner'
import { dueApprovals } from './db/approvals.ts'
import { listEnabledSchedules, scheduleSkipReason } from './db/triggers.ts'
import { timeOutApproval } from './engine/approvals.ts'
import { startRun } from './engine/executor.ts'
import type { EngineDeps } from './engine/types.ts'

export type Scheduler = {
  /** Re-reads the triggers table and replaces the registered jobs. */
  reload(): void
  /** Stops every job. */
  stop(): void
}

const fire = (deps: EngineDeps, triggerId: string, agentId: string): void => {
  const skip = scheduleSkipReason(deps.db, agentId)
  if (skip) {
    console.log(`schedule ${triggerId} skipped: ${skip}`)
    return
  }
  const run = startRun(deps, {
    agentId,
    triggerKind: 'schedule',
    input: { scheduledAt: new Date().toISOString() },
  })
  console.log(`schedule ${triggerId} started run ${run.id}`)
}

/** One croner job per enabled schedule trigger. A stored cron that no longer parses is logged and skipped. */
const registerJobs = (deps: EngineDeps): Cron[] =>
  listEnabledSchedules(deps.db).flatMap((trigger) => {
    if (trigger.config.kind !== 'schedule') return []
    const { cron, timezone } = trigger.config
    try {
      return [
        new Cron(
          cron,
          {
            name: `schedule:${trigger.id}`,
            timezone,
            catch: (err) => console.error(`schedule ${trigger.id} failed:`, err),
          },
          () => fire(deps, trigger.id, trigger.agentId),
        ),
      ]
    } catch (err) {
      console.error(`schedule ${trigger.id} not registered:`, err)
      return []
    }
  })

/** Times out every pending approval whose wait has passed. Returns how many were timed out. */
export const expireTimedOut = (deps: EngineDeps, now: Date): number => {
  let count = 0
  for (const due of dueApprovals(deps.db, now)) {
    if (!timeOutApproval(deps, due)) continue
    count += 1
    console.log(`approval ${due.id} timed out (${due.onTimeout}) on run ${due.runId}`)
  }
  return count
}

export const startScheduler = (deps: EngineDeps): Scheduler => {
  let jobs = registerJobs(deps)
  // Approval timeouts are checked once a minute, on the minute.
  const housekeeping = new Cron(
    '* * * * *',
    { catch: (err) => console.error('approval timeout check failed:', err) },
    () => {
      expireTimedOut(deps, new Date())
    },
  )
  return {
    reload: () => {
      for (const job of jobs) job.stop()
      jobs = registerJobs(deps)
    },
    stop: () => {
      for (const job of jobs) job.stop()
      jobs = []
      housekeeping.stop()
    },
  }
}
