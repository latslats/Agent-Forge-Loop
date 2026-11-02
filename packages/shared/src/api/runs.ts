import { z } from 'zod'
import { Id } from '../schema/common.ts'
import { Approval, Run, RunEvent, RunStatus } from '../schema/run.ts'

/** Body of POST /api/agents/:id/runs. `input` is any JSON value (the UI sends text or an object). */
export const StartRunBody = z.object({
  input: z.unknown(),
  // Defaults to the agent's current version. Only the eval runner asks for older ones.
  versionNumber: z.number().int().positive().optional(),
})
export type StartRunBody = z.infer<typeof StartRunBody>

/** Query string of GET /api/runs. */
export const RunListQuery = z.object({
  agentId: Id.optional(),
  status: RunStatus.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
export type RunListQuery = z.infer<typeof RunListQuery>

/** A run as listed, with its agent's name so the global list needs no second request. */
export const RunSummary = Run.extend({ agentName: z.string() })
export type RunSummary = z.infer<typeof RunSummary>

export const RunDetail = RunSummary.extend({
  events: z.array(RunEvent),
  approvals: z.array(Approval),
})
export type RunDetail = z.infer<typeof RunDetail>

/** An approval waiting for a decision, with enough context to show it in a queue. */
export const PendingApproval = Approval.extend({
  agentId: Id,
  agentName: z.string(),
  message: z.string(),
})
export type PendingApproval = z.infer<typeof PendingApproval>

export const ApprovalDecision = z.enum(['approve', 'reject'])
export type ApprovalDecision = z.infer<typeof ApprovalDecision>

export const ApprovalDecisionBody = z.object({ note: z.string().default('') })
export type ApprovalDecisionBody = z.infer<typeof ApprovalDecisionBody>

/**
 * GET /api/runs/:id/events is a Server-Sent Events stream. Stored events are replayed first, then
 * live ones follow. Each message is `event: run_event` with a RunEvent as JSON data. The stream
 * ends with `event: done` carrying the final Run. A comment line every 15 s keeps it alive.
 */
export const SSE_RUN_EVENT = 'run_event'
export const SSE_DONE = 'done'

export const runRoutes = {
  /** GET: RunSummary[] filtered by RunListQuery. */
  runs: '/api/runs',
  /** GET: RunSummary[] for one agent, newest first. POST StartRunBody: 201 Run (queued or running). */
  agentRuns: (agentId: string) => `/api/agents/${agentId}/runs`,
  /** GET: RunDetail. */
  run: (id: string) => `/api/runs/${id}`,
  /** GET: the SSE stream described above. */
  runEvents: (id: string) => `/api/runs/${id}/events`,
  /** POST: Run with status cancelled (no-op when the run already ended). */
  cancelRun: (id: string) => `/api/runs/${id}/cancel`,
  /** GET: PendingApproval[] across all agents, oldest first. */
  pendingApprovals: '/api/approvals',
  /** POST ApprovalDecisionBody: RunDetail after the run resumed (approve) or failed (reject). */
  approvalDecision: (runId: string, approvalId: string, decision: ApprovalDecision) =>
    `/api/runs/${runId}/approvals/${approvalId}/${decision}`,
} as const
