import { type CreateMemoryBody, Memory, memoryRoutes } from '@agentforgeloop/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { queryKeys, request } from './client.ts'

async function listMemories(agentId: string) {
  return z.array(Memory).parse(await request('GET', memoryRoutes.memories(agentId)))
}

async function createMemory(agentId: string, body: CreateMemoryBody) {
  return Memory.parse(await request('POST', memoryRoutes.memories(agentId), body))
}

async function deleteMemory(id: string) {
  await request('DELETE', memoryRoutes.memory(id))
}

async function clearMemories(agentId: string) {
  await request('DELETE', memoryRoutes.memories(agentId))
}

export function useMemories(agentId: string) {
  return useQuery({ queryKey: queryKeys.memories(agentId), queryFn: () => listMemories(agentId) })
}

export function useCreateMemory(agentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateMemoryBody) => createMemory(agentId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.memories(agentId) }),
  })
}

export function useDeleteMemory(agentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteMemory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.memories(agentId) }),
  })
}

export function useClearMemories(agentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => clearMemories(agentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.memories(agentId) }),
  })
}
