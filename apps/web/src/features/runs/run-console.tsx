import type { AgentWithVersions, Run, RunEvent } from '@agentforgeloop/shared'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  errorMessage,
  isActiveRunStatus,
  queryKeys,
  useCancelRun,
  useStartRun,
} from '../../api/client.ts'
import { subscribeRun } from '../../api/sse.ts'
import { Button } from '../../components/ui/button.tsx'
import { Textarea } from '../../components/ui/textarea.tsx'
import { compactNumber, money } from '../../lib/format.ts'
import { activeRunStore, useActiveRun } from './active-run.ts'
import { RunFeed } from './run-feed.tsx'
import { nodeLabels, parseRunInput, usageTotals } from './run-format.ts'
import { RunStatusBadge } from './run-status-badge.tsx'

export type RunConsoleHandle = { focusInput: () => void }

/**
 * The drawer docked at the bottom of the agent page. It starts runs, follows the active run over
 * SSE and shows its events. The run lives in activeRunStore, so the canvas can follow it too.
 */
export function RunConsole({
  ref,
  agent,
}: {
  ref?: Ref<RunConsoleHandle>
  agent: AgentWithVersions
}) {
  const queryClient = useQueryClient()
  const active = useActiveRun(agent.id)
  const startRun = useStartRun(agent.id)
  const cancelRun = useCancelRun()
  const [open, setOpen] = useState(false)
  const [focusTick, setFocusTick] = useState(0)
  const [input, setInput] = useState('')
  const [events, setEvents] = useState<RunEvent[]>([])
  const [final, setFinal] = useState<Run | null>(null)
  const [feedError, setFeedError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  const runId = active.runId
  const busy = isActiveRunStatus(active.status)
  const hasVersion = agent.currentVersion !== null
  const labels = nodeLabels(agent, agent.currentVersion)
  const totals = final
    ? { costUsd: final.costUsd, tokens: final.tokensIn + final.tokensOut }
    : usageTotals(events)

  useImperativeHandle(ref, () => ({
    focusInput: () => {
      setOpen(true)
      setFocusTick((tick) => tick + 1)
    },
  }))

  useEffect(() => {
    if (focusTick > 0) inputRef.current?.focus()
  }, [focusTick])

  useEffect(() => {
    const feed = feedRef.current
    if (feed && events.length > 0) feed.scrollTop = feed.scrollHeight
  }, [events])

  // Follows the store's run. Starting a run, or coming back to a page with a run in the store,
  // replays its stored events first, so the feed is complete.
  useEffect(() => {
    if (!runId) return
    setEvents([])
    setFinal(null)
    setFeedError(null)
    const stream = subscribeRun(runId, {
      onEvent: (event) => {
        setEvents((current) => [...current, event])
        activeRunStore.apply(event)
      },
      onDone: (run) => {
        setFinal(run)
        activeRunStore.setStatus(run.status)
        void queryClient.invalidateQueries({ queryKey: queryKeys.runs })
      },
      onError: setFeedError,
    })
    return () => stream.close()
  }, [runId, queryClient])

  const submit = () => {
    startRun.mutate(
      { input: parseRunInput(input) },
      { onSuccess: (run) => activeRunStore.start(run.id, run.agentId) },
    )
  }

  const cancel = () => {
    if (runId) cancelRun.mutate(runId)
  }

  const problem = startRun.error ?? cancelRun.error
  const hint = !hasVersion ? 'Publish first' : busy ? 'Running…' : null
  const finished = runId !== null && !busy

  return (
    <section aria-label="Run console" className="shrink-0 border-t border-line bg-panel">
      <div className="flex h-11 items-center gap-3 px-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex cursor-pointer items-center gap-1.5 font-medium"
        >
          {open ? (
            <ChevronDown className="size-4" aria-hidden="true" />
          ) : (
            <ChevronUp className="size-4" aria-hidden="true" />
          )}
          Run console
        </button>
        {active.status && <RunStatusBadge status={active.status} />}
        <span className="text-xs text-muted tabular-nums">Cost {money(totals.costUsd)}</span>
        <span className="text-xs text-muted tabular-nums">
          {compactNumber(totals.tokens)} tokens
        </span>
      </div>

      {open && (
        <div className="flex h-[max(280px,40vh)] flex-col border-t border-line lg:flex-row">
          <div className="flex w-full shrink-0 flex-col gap-2 p-3 lg:w-80 lg:border-r lg:border-line">
            <Textarea
              ref={inputRef}
              aria-label="Run input"
              placeholder="Describe the case, or paste JSON"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="min-h-0 flex-1 resize-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                onClick={submit}
                disabled={!hasVersion || busy || input.trim() === '' || startRun.isPending}
              >
                Run
              </Button>
              {busy && (
                <Button variant="secondary" onClick={cancel} disabled={cancelRun.isPending}>
                  Cancel
                </Button>
              )}
              {hint && <span className="text-xs text-muted">{hint}</span>}
              {finished && (
                <Link to={`/runs/${runId}`} className="text-xs font-medium text-accent-ink">
                  Open run
                </Link>
              )}
            </div>
            {problem && (
              <p role="alert" className="text-xs text-danger">
                {errorMessage(problem)}
              </p>
            )}
          </div>

          <div ref={feedRef} className="min-h-0 flex-1 overflow-y-auto p-3">
            {feedError && (
              <p role="alert" className="mb-2 text-xs text-danger">
                {feedError}
              </p>
            )}
            {runId === null ? (
              <p className="text-sm text-muted">Run the agent to see its steps here.</p>
            ) : events.length === 0 && !feedError ? (
              <p className="text-sm text-muted">Waiting for the first event…</p>
            ) : (
              <RunFeed runId={runId} events={events} labels={labels} />
            )}
          </div>
        </div>
      )}
    </section>
  )
}
