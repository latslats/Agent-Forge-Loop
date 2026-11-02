import { z } from 'zod'
import { AgentDefinition } from '../schema/agent.ts'
import { DEFAULT_MODEL, ModelId } from '../schema/common.ts'

/** Body of POST /api/draft: a plain-language description the model turns into a definition. */
export const DraftAgentBody = z.object({
  description: z.string().min(10),
  model: ModelId.default(DEFAULT_MODEL),
})
export type DraftAgentBody = z.infer<typeof DraftAgentBody>
export type DraftAgentBodyInput = z.input<typeof DraftAgentBody>

/** The drafted definition plus the validateDefinition problems that remain after one repair round. */
export const DraftAgentResponse = z.object({
  definition: AgentDefinition,
  problems: z.array(z.string()),
})
export type DraftAgentResponse = z.infer<typeof DraftAgentResponse>

export const TemplateSummary = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  nodeCount: z.number().int(),
})
export type TemplateSummary = z.infer<typeof TemplateSummary>

/** Body of POST /api/templates/:id/agents. Without `name`, the template's name is used. */
export const CreateFromTemplateBody = z.object({ name: z.string().min(1).optional() })
export type CreateFromTemplateBody = z.infer<typeof CreateFromTemplateBody>

export const draftRoutes = {
  /** POST DraftAgentBody: 200 DraftAgentResponse (502 { error } when the model call fails). */
  draft: '/api/draft',
  /** GET: TemplateSummary[]. */
  templates: '/api/templates',
  /** POST CreateFromTemplateBody: 201 Agent, already published as v1. */
  templateAgents: (id: string) => `/api/templates/${id}/agents`,
} as const
