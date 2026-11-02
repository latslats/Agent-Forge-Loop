import {
  type CreateTriggerBody,
  TriggerView,
  triggerRoutes,
  type UpdateTriggerBody,
} from '@agentforgeloop/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { request } from './client.ts'

export const triggerKeys = {
  list: (agentId: string) => ['triggers', agentId] as const,
}

async function listTriggers(agentId: string) {
  return z.array(TriggerView).parse(await request('GET', triggerRoutes.triggers(agentId)))
}

async function createTrigger(agentId: string, body: CreateTriggerBody) {
  return TriggerView.parse(await request('POST', triggerRoutes.triggers(agentId), body))
}

async function updateTrigger(id: string, body: UpdateTriggerBody) {
  return TriggerView.parse(await request('PATCH', triggerRoutes.trigger(id), body))
}

async function deleteTrigger(id: string) {
  await request('DELETE', triggerRoutes.trigger(id))
}

export function useTriggers(agentId: string) {
  return useQuery({ queryKey: triggerKeys.list(agentId), queryFn: () => listTriggers(agentId) })
}

export function useCreateTrigger(agentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateTriggerBody) => createTrigger(agentId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: triggerKeys.list(agentId) }),
  })
}

export function useUpdateTrigger(agentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTriggerBody }) => updateTrigger(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: triggerKeys.list(agentId) }),
  })
}

export function useDeleteTrigger(agentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTrigger(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: triggerKeys.list(agentId) }),
  })
}
