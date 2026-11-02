import {
  Agent,
  type DraftAgentBody,
  DraftAgentResponse,
  draftRoutes,
  TemplateSummary,
} from '@agentforgeloop/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { queryKeys, request } from './client.ts'

const templatesKey = ['templates'] as const

async function draftAgent(body: DraftAgentBody) {
  return DraftAgentResponse.parse(await request('POST', draftRoutes.draft, body))
}

async function listTemplates() {
  return z.array(TemplateSummary).parse(await request('GET', draftRoutes.templates))
}

async function createFromTemplate(id: string, name: string | undefined) {
  const body = name ? { name } : {}
  return Agent.parse(await request('POST', draftRoutes.templateAgents(id), body))
}

/** Asks the model for a drafted definition. Nothing is saved until the dialog creates the agent. */
export function useDraftAgent() {
  return useMutation({ mutationFn: (body: DraftAgentBody) => draftAgent(body) })
}

export function useTemplates() {
  return useQuery({ queryKey: templatesKey, queryFn: listTemplates })
}

export function useCreateFromTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name?: string }) => createFromTemplate(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.agents }),
  })
}
