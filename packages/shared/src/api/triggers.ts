import { z } from 'zod'
import { Id } from '../schema/common.ts'
import { Trigger } from '../schema/run.ts'

/** Body of POST /api/agents/:id/triggers. The server generates a webhook's secret. */
export const CreateTriggerBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('schedule'), cron: z.string(), timezone: z.string().default('UTC') }),
  z.object({ kind: z.literal('webhook') }),
])
export type CreateTriggerBody = z.infer<typeof CreateTriggerBody>
export type CreateTriggerBodyInput = z.input<typeof CreateTriggerBody>

export const UpdateTriggerBody = z.object({
  enabled: z.boolean().optional(),
  cron: z.string().optional(),
  timezone: z.string().optional(),
})
export type UpdateTriggerBody = z.infer<typeof UpdateTriggerBody>

/** A trigger as the UI reads it. `webhookUrl` is `/hooks/<agentId>/<secret>` for webhooks, null for schedules. */
export const TriggerView = Trigger.extend({ webhookUrl: z.string().nullable() })
export type TriggerView = z.infer<typeof TriggerView>

export const WebhookAccepted = z.object({ runId: Id })
export type WebhookAccepted = z.infer<typeof WebhookAccepted>

export const triggerRoutes = {
  /** GET: TriggerView[] for one agent. POST CreateTriggerBody: 201 TriggerView. */
  triggers: (agentId: string) => `/api/agents/${agentId}/triggers`,
  /** PATCH UpdateTriggerBody: 200 TriggerView. DELETE: 204, no body. */
  trigger: (id: string) => `/api/triggers/${id}`,
  /** POST any JSON body (the run input): 202 WebhookAccepted. Not under /api. */
  hook: (agentId: string, secret: string) => `/hooks/${agentId}/${secret}`,
} as const
