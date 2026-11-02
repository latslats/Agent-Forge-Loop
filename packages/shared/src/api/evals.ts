import { z } from 'zod'
import { Id } from '../schema/common.ts'
import { EvalResult, EvalRun, Scorer } from '../schema/eval.ts'

export const CreateDatasetBody = z.object({ name: z.string().min(1) })
export type CreateDatasetBody = z.infer<typeof CreateDatasetBody>

export const CreateCaseBody = z.object({
  name: z.string().min(1),
  input: z.unknown(),
  scorers: z.array(Scorer).min(1),
  tags: z.array(z.string()).default([]),
})
export type CreateCaseBody = z.infer<typeof CreateCaseBody>
export type CreateCaseBodyInput = z.input<typeof CreateCaseBody>

// tags has no default here, so a PATCH without tags leaves them unchanged.
export const UpdateCaseBody = CreateCaseBody.partial().extend({
  tags: z.array(z.string()).optional(),
})
export type UpdateCaseBody = z.infer<typeof UpdateCaseBody>

export const StartEvalRunBody = z.object({
  datasetId: Id,
  // Defaults to the agent's current version.
  versionNumber: z.number().int().positive().optional(),
})
export type StartEvalRunBody = z.infer<typeof StartEvalRunBody>

/** One case's result, with the case name so the results table needs no second request. */
export const EvalCaseResult = EvalResult.extend({ caseName: z.string() })
export type EvalCaseResult = z.infer<typeof EvalCaseResult>

export const EvalRunDetail = EvalRun.extend({
  datasetName: z.string(),
  results: z.array(EvalCaseResult),
})
export type EvalRunDetail = z.infer<typeof EvalRunDetail>

export const evalRoutes = {
  /** GET: EvalDataset[] for one agent. POST CreateDatasetBody: 201 EvalDataset. */
  datasets: (agentId: string) => `/api/agents/${agentId}/evals/datasets`,
  /** DELETE: 204, no body. */
  dataset: (id: string) => `/api/evals/datasets/${id}`,
  /** GET: EvalCase[] of one dataset. POST CreateCaseBody: 201 EvalCase. */
  cases: (datasetId: string) => `/api/evals/datasets/${datasetId}/cases`,
  /** PATCH UpdateCaseBody: 200 EvalCase. DELETE: 204, no body. */
  evalCase: (id: string) => `/api/evals/cases/${id}`,
  /** GET: EvalRun[] for one agent, newest first. POST StartEvalRunBody: 202 EvalRun (queued). */
  evalRuns: (agentId: string) => `/api/agents/${agentId}/evals/runs`,
  /** GET: EvalRunDetail (the run, its dataset name and one EvalCaseResult per case). */
  evalRun: (id: string) => `/api/evals/runs/${id}`,
} as const
