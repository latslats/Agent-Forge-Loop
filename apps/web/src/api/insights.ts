import { HealthScores, InsightsOverview, insightsRoutes } from '@agentforgeloop/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { request } from './client.ts'

/** The windows the Insights views offer. Matches InsightsQuery on the server. */
export const WINDOWS = [7, 14, 30] as const
export type WindowDays = (typeof WINDOWS)[number]

export type InsightsFilter = { agentId?: string; days: WindowDays }

export const insightKeys = {
  overview: (filter: InsightsFilter) => ['insights', 'overview', filter] as const,
  health: (agentId: string) => ['insights', 'health', agentId] as const,
}

// The browser's zone, so the window and the day buckets follow the viewer's calendar.
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

function overviewPath(filter: InsightsFilter): string {
  const params = new URLSearchParams({ days: String(filter.days), timezone })
  if (filter.agentId) params.set('agentId', filter.agentId)
  return `${insightsRoutes.overview}?${params.toString()}`
}

async function getOverview(filter: InsightsFilter) {
  return InsightsOverview.parse(await request('GET', overviewPath(filter)))
}

async function getHealth(agentId: string) {
  return HealthScores.nullable().parse(await request('GET', insightsRoutes.agentHealth(agentId)))
}

/** Keeps the previous window on screen while a new one loads, so the page does not jump. */
export function useInsights(filter: InsightsFilter) {
  return useQuery({
    queryKey: insightKeys.overview(filter),
    queryFn: () => getOverview(filter),
    placeholderData: keepPreviousData,
  })
}

export function useAgentHealth(agentId: string) {
  return useQuery({ queryKey: insightKeys.health(agentId), queryFn: () => getHealth(agentId) })
}
