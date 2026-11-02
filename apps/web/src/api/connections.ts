import {
  ConnectionView,
  type CreateConnectionBody,
  connectionRoutes,
  type UpdateConnectionBody,
} from '@agentforgeloop/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { queryKeys, request } from './client.ts'

async function listConnections() {
  return z.array(ConnectionView).parse(await request('GET', connectionRoutes.connections))
}

async function createConnection(body: CreateConnectionBody) {
  return ConnectionView.parse(await request('POST', connectionRoutes.connections, body))
}

async function updateConnection(id: string, body: UpdateConnectionBody) {
  return ConnectionView.parse(await request('PATCH', connectionRoutes.connection(id), body))
}

async function deleteConnection(id: string) {
  await request('DELETE', connectionRoutes.connection(id))
}

async function refreshConnection(id: string) {
  return ConnectionView.parse(await request('POST', connectionRoutes.refresh(id)))
}

export function useConnections() {
  return useQuery({ queryKey: queryKeys.connections, queryFn: listConnections })
}

export function useCreateConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createConnection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.connections }),
  })
}

/** Optimistic for the tool switches: the list flips at once and rolls back if the PATCH fails. */
export function useUpdateConnection(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateConnectionBody) => updateConnection(id, body),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.connections })
      const previous = queryClient.getQueryData<ConnectionView[]>(queryKeys.connections)
      if (previous && body.enabledTools) {
        const enabledTools = body.enabledTools
        queryClient.setQueryData<ConnectionView[]>(
          queryKeys.connections,
          previous.map((connection) =>
            connection.id === id ? { ...connection, enabledTools } : connection,
          ),
        )
      }
      return { previous }
    },
    onError: (_error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.connections, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.connections }),
  })
}

export function useDeleteConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteConnection(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.connections }),
  })
}

export function useRefreshConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => refreshConnection(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.connections }),
  })
}
