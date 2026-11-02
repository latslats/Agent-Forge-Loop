import {
  type CreateCaseBody,
  EvalCase,
  EvalDataset,
  EvalRun,
  EvalRunDetail,
  type EvalRunStatus,
  evalRoutes,
  type StartEvalRunBody,
  type UpdateCaseBody,
} from '@agentforgeloop/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { request } from './client.ts'

// Every eval query lives under 'evals', so one prefix invalidation refreshes them all.
const EVALS = ['evals'] as const
const POLL_MS = 2000

export const isActiveEvalStatus = (status: EvalRunStatus): boolean =>
  status === 'queued' || status === 'running'

async function listDatasets(agentId: string) {
  return z.array(EvalDataset).parse(await request('GET', evalRoutes.datasets(agentId)))
}

async function createDataset(agentId: string, name: string) {
  return EvalDataset.parse(await request('POST', evalRoutes.datasets(agentId), { name }))
}

async function deleteDataset(id: string) {
  await request('DELETE', evalRoutes.dataset(id))
}

async function listCases(datasetId: string) {
  return z.array(EvalCase).parse(await request('GET', evalRoutes.cases(datasetId)))
}

async function createCase(datasetId: string, body: CreateCaseBody) {
  return EvalCase.parse(await request('POST', evalRoutes.cases(datasetId), body))
}

async function updateCase(id: string, body: UpdateCaseBody) {
  return EvalCase.parse(await request('PATCH', evalRoutes.evalCase(id), body))
}

async function deleteCase(id: string) {
  await request('DELETE', evalRoutes.evalCase(id))
}

async function listEvalRuns(agentId: string) {
  return z.array(EvalRun).parse(await request('GET', evalRoutes.evalRuns(agentId)))
}

async function startEvalRun(agentId: string, body: StartEvalRunBody) {
  return EvalRun.parse(await request('POST', evalRoutes.evalRuns(agentId), body))
}

async function getEvalRun(id: string) {
  return EvalRunDetail.parse(await request('GET', evalRoutes.evalRun(id)))
}

export function useDatasets(agentId: string) {
  return useQuery({
    queryKey: ['evals', 'datasets', agentId],
    queryFn: () => listDatasets(agentId),
  })
}

export function useCreateDataset(agentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => createDataset(agentId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EVALS }),
  })
}

export function useDeleteDataset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteDataset(id),
    // Deleting a dataset also deletes its eval runs.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EVALS }),
  })
}

export function useCases(datasetId: string) {
  return useQuery({
    queryKey: ['evals', 'cases', datasetId],
    queryFn: () => listCases(datasetId),
  })
}

export function useCreateCase(datasetId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCaseBody) => createCase(datasetId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EVALS }),
  })
}

export function useUpdateCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCaseBody }) => updateCase(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EVALS }),
  })
}

export function useDeleteCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteCase(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EVALS }),
  })
}

/** Polls every 2 s while any run of the agent is queued or running. */
export function useEvalRuns(agentId: string) {
  return useQuery({
    queryKey: ['evals', 'runs', agentId],
    queryFn: () => listEvalRuns(agentId),
    refetchInterval: (query) =>
      query.state.data?.some((run) => isActiveEvalStatus(run.status)) ? POLL_MS : false,
  })
}

export function useStartEvalRun(agentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: StartEvalRunBody) => startEvalRun(agentId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EVALS }),
  })
}

/** Polls every 2 s while the eval run is queued or running. */
export function useEvalRun(id: string) {
  return useQuery({
    queryKey: ['evals', 'run', id],
    queryFn: () => getEvalRun(id),
    refetchInterval: (query) =>
      query.state.data && isActiveEvalStatus(query.state.data.status) ? POLL_MS : false,
  })
}
