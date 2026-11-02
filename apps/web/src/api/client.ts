import {
  Agent,
  AgentVersion,
  AgentWithVersions,
  ApiError as ApiErrorBody,
  type ApprovalDecision,
  type ApprovalDecisionBody,
  type CreateAgentBody,
  PendingApproval,
  type PublishVersionBody,
  Run,
  RunDetail,
  type RunStatus,
  RunSummary,
  routes,
  runRoutes,
  type StartRunBody,
  type UpdateAgentBody,
} from '@agentforgeloop/shared'
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ZodError, z } from 'zod'

/** A non-2xx response. `body` is the parsed JSON, or the raw text when the body is not JSON. */
export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown) {
    super(`Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export type RunFilter = { agentId?: string; status?: RunStatus; limit?: number }

export const queryKeys = {
  agents: ['agents'] as const,
  agent: (id: string) => ['agents', id] as const,
  runs: ['runs'] as const,
  runList: (filter: RunFilter) => ['runs', 'list', filter] as const,
  agentRuns: (agentId: string) => ['runs', 'agent', agentId] as const,
  run: (id: string) => ['runs', 'detail', id] as const,
  approvals: ['approvals'] as const,
  connections: ['connections'] as const,
  memories: (agentId: string) => ['memories', agentId] as const,
}

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

function parseBody(text: string): unknown {
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** The only fetch call in the web app. Other api/*.ts files import it and parse the result. */
export async function request(method: Method, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const parsed = parseBody(await response.text())
  if (!response.ok) throw new ApiError(response.status, parsed)
  return parsed
}

// Every response passes through the shared zod schema before the UI reads it.
async function listAgents() {
  return z.array(Agent).parse(await request('GET', routes.agents))
}

async function getAgent(id: string) {
  return AgentWithVersions.parse(await request('GET', routes.agent(id)))
}

async function createAgent(body: CreateAgentBody) {
  return Agent.parse(await request('POST', routes.agents, body))
}

async function updateAgent(id: string, body: UpdateAgentBody) {
  return Agent.parse(await request('PATCH', routes.agent(id), body))
}

async function deleteAgent(id: string) {
  await request('DELETE', routes.agent(id))
}

async function publishVersion(id: string, body: PublishVersionBody) {
  return AgentVersion.parse(await request('POST', routes.versions(id), body))
}

export function useAgents() {
  return useQuery({ queryKey: queryKeys.agents, queryFn: listAgents })
}

export function useAgent(id: string) {
  return useQuery({ queryKey: queryKeys.agent(id), queryFn: () => getAgent(id) })
}

export function useCreateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createAgent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.agents }),
  })
}

export function useUpdateAgent(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateAgentBody) => updateAgent(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.agents }),
  })
}

export function useDeleteAgent(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => deleteAgent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.agents }),
  })
}

export function usePublishVersion(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: PublishVersionBody) => publishVersion(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.agents }),
  })
}

// Runs. Live events come from api/sse.ts; these calls read and write the stored state.
const ACTIVE_RUN_STATUSES: readonly RunStatus[] = ['queued', 'running', 'waiting_approval']

/** True while a run can still change: queued, running or waiting for an approval. */
export function isActiveRunStatus(status: RunStatus | null | undefined): boolean {
  return status !== null && status !== undefined && ACTIVE_RUN_STATUSES.includes(status)
}

function runListPath(filter: RunFilter): string {
  const params = new URLSearchParams()
  if (filter.agentId) params.set('agentId', filter.agentId)
  if (filter.status) params.set('status', filter.status)
  if (filter.limit) params.set('limit', String(filter.limit))
  const query = params.toString()
  return query ? `${runRoutes.runs}?${query}` : runRoutes.runs
}

async function listRuns(filter: RunFilter) {
  return z.array(RunSummary).parse(await request('GET', runListPath(filter)))
}

async function listAgentRuns(agentId: string) {
  return z.array(RunSummary).parse(await request('GET', runRoutes.agentRuns(agentId)))
}

async function getRun(id: string) {
  return RunDetail.parse(await request('GET', runRoutes.run(id)))
}

async function startRun(agentId: string, body: StartRunBody) {
  return Run.parse(await request('POST', runRoutes.agentRuns(agentId), body))
}

async function cancelRun(id: string) {
  return Run.parse(await request('POST', runRoutes.cancelRun(id)))
}

async function listPendingApprovals() {
  return z.array(PendingApproval).parse(await request('GET', runRoutes.pendingApprovals))
}

export type DecideApprovalVars = {
  runId: string
  approvalId: string
  decision: ApprovalDecision
  note: string
}

async function decideApproval({ runId, approvalId, decision, note }: DecideApprovalVars) {
  const body: ApprovalDecisionBody = { note }
  const path = runRoutes.approvalDecision(runId, approvalId, decision)
  return RunDetail.parse(await request('POST', path, body))
}

// A run write changes both the run lists and the approval queue, so both are refreshed.
function invalidateRunData(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.runs }),
    queryClient.invalidateQueries({ queryKey: queryKeys.approvals }),
  ])
}

export function useRuns(filter: RunFilter = {}) {
  return useQuery({ queryKey: queryKeys.runList(filter), queryFn: () => listRuns(filter) })
}

export function useAgentRuns(agentId: string) {
  return useQuery({ queryKey: queryKeys.agentRuns(agentId), queryFn: () => listAgentRuns(agentId) })
}

/** Polls every 1.5 s while the run is active, so the run page follows it without SSE. */
export function useRun(id: string) {
  return useQuery({
    queryKey: queryKeys.run(id),
    queryFn: () => getRun(id),
    refetchInterval: (query) => (isActiveRunStatus(query.state.data?.status) ? 1500 : false),
  })
}

export function usePendingApprovals() {
  return useQuery({ queryKey: queryKeys.approvals, queryFn: listPendingApprovals })
}

export function useStartRun(agentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: StartRunBody) => startRun(agentId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.runs }),
  })
}

export function useCancelRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => cancelRun(runId),
    onSuccess: () => invalidateRunData(queryClient),
  })
}

export function useDecideApproval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: DecideApprovalVars) => decideApproval(vars),
    onSuccess: () => invalidateRunData(queryClient),
  })
}

/** A short, user-facing reason for a failed request, parse or network call. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const body = ApiErrorBody.safeParse(error.body)
    if (body.success) return body.data.error
    return `The server returned an error (${error.status}).`
  }
  if (error instanceof ZodError) return 'The server sent a response in an unexpected format.'
  if (error instanceof TypeError) {
    return "Can't reach the server. Start it with npm run dev, then try again."
  }
  return 'Something went wrong.'
}
