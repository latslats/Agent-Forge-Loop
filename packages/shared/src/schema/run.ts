import { z } from 'zod'
import { Id, IsoDate } from './common.ts'

export const RunStatus = z.enum([
  'queued',
  'running',
  'waiting_approval',
  'succeeded',
  'failed',
  'cancelled',
])
export type RunStatus = z.infer<typeof RunStatus>

export const TriggerKind = z.enum(['manual', 'api', 'webhook', 'schedule', 'eval'])
export type TriggerKind = z.infer<typeof TriggerKind>

export const Run = z.object({
  id: Id,
  agentId: Id,
  versionId: Id,
  versionNumber: z.number().int(),
  triggerKind: TriggerKind,
  status: RunStatus,
  // Producers must always set every z.unknown() field, writing null when empty.
  // zod rejects an absent key, and JSON round-trips (HTTP, DB) drop undefined values.
  input: z.unknown(),
  output: z.unknown().nullable(),
  tokensIn: z.number().int().default(0),
  tokensOut: z.number().int().default(0),
  costUsd: z.number().default(0),
  error: z.string().nullable(),
  startedAt: IsoDate.nullable(),
  finishedAt: IsoDate.nullable(),
  createdAt: IsoDate,
})
export type Run = z.infer<typeof Run>

export const RunEventKind = z.enum([
  'run_start',
  'node_start',
  'node_end',
  'model_call',
  'tool_call',
  'tool_result',
  'check_result',
  'approval_requested',
  'approval_resolved',
  'log',
  'error',
  'run_end',
])
export type RunEventKind = z.infer<typeof RunEventKind>

export const RunEvent = z.object({
  id: Id,
  runId: Id,
  seq: z.number().int(),
  ts: IsoDate,
  kind: RunEventKind,
  nodeId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
})
export type RunEvent = z.infer<typeof RunEvent>

// Payload shapes per event kind. Used by the engine (to build) and the UI (to read);
// RunEvent.payload itself stays an open record so unknown kinds never fail to parse.
export const ModelCallPayload = z.object({
  model: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cacheReadTokens: z.number().int(),
  cacheWriteTokens: z.number().int(),
  costUsd: z.number(),
  stopReason: z.string(),
  durationMs: z.number(),
})
export type ModelCallPayload = z.infer<typeof ModelCallPayload>

export const ToolCallPayload = z.object({ tool: z.string(), input: z.unknown() })
export type ToolCallPayload = z.infer<typeof ToolCallPayload>

export const ToolResultPayload = z.object({
  tool: z.string(),
  output: z.unknown(),
  isError: z.boolean(),
  durationMs: z.number(),
})
export type ToolResultPayload = z.infer<typeof ToolResultPayload>

export const CheckResultPayload = z.object({
  kind: z.string(),
  pass: z.boolean(),
  reason: z.string(),
})
export type CheckResultPayload = z.infer<typeof CheckResultPayload>

export const ApprovalRequestedPayload = z.object({ approvalId: Id, message: z.string() })
export type ApprovalRequestedPayload = z.infer<typeof ApprovalRequestedPayload>

export const ApprovalStatus = z.enum(['pending', 'approved', 'rejected', 'expired'])
export type ApprovalStatus = z.infer<typeof ApprovalStatus>

export const ApprovalResolvedPayload = z.object({ approvalId: Id, status: ApprovalStatus })
export type ApprovalResolvedPayload = z.infer<typeof ApprovalResolvedPayload>

export const NodeEndPayload = z.object({
  status: z.enum(['ok', 'failed', 'skipped']),
  durationMs: z.number(),
})
export type NodeEndPayload = z.infer<typeof NodeEndPayload>

export const RunEndPayload = z.object({
  status: RunStatus,
  costUsd: z.number(),
  durationMs: z.number(),
})
export type RunEndPayload = z.infer<typeof RunEndPayload>

export const LogPayload = z.object({ message: z.string() })
export type LogPayload = z.infer<typeof LogPayload>

export const ErrorPayload = z.object({ message: z.string() })
export type ErrorPayload = z.infer<typeof ErrorPayload>

export const Approval = z.object({
  id: Id,
  runId: Id,
  nodeId: Id,
  status: ApprovalStatus,
  note: z.string().nullable(),
  requestedAt: IsoDate,
  resolvedAt: IsoDate.nullable(),
})
export type Approval = z.infer<typeof Approval>

export const ScheduleConfig = z.object({
  kind: z.literal('schedule'),
  cron: z.string(),
  timezone: z.string().default('UTC'),
})
export type ScheduleConfig = z.infer<typeof ScheduleConfig>

export const WebhookConfig = z.object({ kind: z.literal('webhook'), secret: z.string() })
export type WebhookConfig = z.infer<typeof WebhookConfig>

export const TriggerConfig = z.discriminatedUnion('kind', [ScheduleConfig, WebhookConfig])
export type TriggerConfig = z.infer<typeof TriggerConfig>

export const Trigger = z.object({
  id: Id,
  agentId: Id,
  kind: z.enum(['schedule', 'webhook']),
  config: TriggerConfig,
  enabled: z.boolean().default(true),
  createdAt: IsoDate,
})
export type Trigger = z.infer<typeof Trigger>
