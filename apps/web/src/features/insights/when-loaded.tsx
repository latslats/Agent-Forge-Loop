import type { InsightsOverview } from '@agentforgeloop/shared'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { errorMessage } from '../../api/client.ts'
import { EmptyState } from '../../components/ui/empty-state.tsx'
import { Spinner } from '../../components/ui/spinner.tsx'

/** Loading, error and empty states for an overview query. Children get the overview otherwise. */
export function WhenLoaded({
  query,
  days,
  children,
}: {
  query: UseQueryResult<InsightsOverview>
  days: number
  children: (overview: InsightsOverview) => ReactNode
}) {
  if (query.isPending) return <Spinner label="Loading insights…" />
  if (query.isError) {
    return <EmptyState title="Couldn't load insights" description={errorMessage(query.error)} />
  }
  if (query.data.totals.runs === 0) {
    return (
      <EmptyState
        title={`No runs in the last ${days} days`}
        description="Run an agent, or pick a longer window, to see runs, success and spend here."
      />
    )
  }
  // A window change keeps the old figures on screen, dimmed, until the new ones arrive.
  return (
    <div className={query.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
      {children(query.data)}
    </div>
  )
}
