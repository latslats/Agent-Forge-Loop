import { z } from 'zod'
import { Agent, AgentDefinition, AgentStatus, AgentVersion } from './schema/agent.ts'

export const CreateAgentBody = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  draft: AgentDefinition.optional(),
})
export type CreateAgentBody = z.infer<typeof CreateAgentBody>
export type CreateAgentBodyInput = z.input<typeof CreateAgentBody>

export const UpdateAgentBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: AgentStatus.optional(),
  draft: AgentDefinition.optional(),
})
export type UpdateAgentBody = z.infer<typeof UpdateAgentBody>
export type UpdateAgentBodyInput = z.input<typeof UpdateAgentBody>

export const PublishVersionBody = z.object({ note: z.string().default('') })
export type PublishVersionBody = z.infer<typeof PublishVersionBody>

export const AgentWithVersions = Agent.extend({ versions: z.array(AgentVersion) })
export type AgentWithVersions = z.infer<typeof AgentWithVersions>

export const ApiError = z.object({ error: z.string(), details: z.unknown().optional() })
export type ApiError = z.infer<typeof ApiError>

export const Health = z.object({ ok: z.literal(true), version: z.string() })
export type Health = z.infer<typeof Health>

export const routes = {
  health: '/api/health',
  agents: '/api/agents',
  agent: (id: string) => `/api/agents/${id}`,
  versions: (id: string) => `/api/agents/${id}/versions`,
} as const
