import { z } from 'zod'
import { Id, IsoDate } from './common.ts'

export const Scorer = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exact'), expected: z.string() }),
  z.object({ kind: z.literal('contains'), expected: z.string() }),
  z.object({ kind: z.literal('json_schema'), schema: z.record(z.string(), z.unknown()) }),
  z.object({
    kind: z.literal('llm_judge'),
    rubric: z.string(),
    threshold: z.number().min(0).max(1).default(0.7),
  }),
  z.object({ kind: z.literal('tool_calls'), tools: z.array(z.string()) }),
  z.object({ kind: z.literal('latency'), maxMs: z.number().int().positive() }),
  z.object({ kind: z.literal('cost'), maxUsd: z.number().positive() }),
])
export type Scorer = z.infer<typeof Scorer>

export const EvalDataset = z.object({ id: Id, agentId: Id, name: z.string(), createdAt: IsoDate })
export type EvalDataset = z.infer<typeof EvalDataset>

export const EvalCase = z.object({
  id: Id,
  datasetId: Id,
  name: z.string(),
  input: z.unknown(),
  scorers: z.array(Scorer),
  tags: z.array(z.string()).default([]),
})
export type EvalCase = z.infer<typeof EvalCase>

export const EvalRunStatus = z.enum(['queued', 'running', 'succeeded', 'failed'])
export type EvalRunStatus = z.infer<typeof EvalRunStatus>

export const EvalSummary = z.object({
  total: z.number().int(),
  passed: z.number().int(),
  passRate: z.number(),
  meanCostUsd: z.number(),
  p50LatencyMs: z.number(),
})
export type EvalSummary = z.infer<typeof EvalSummary>

export const EvalRun = z.object({
  id: Id,
  agentId: Id,
  datasetId: Id,
  versionId: Id,
  versionNumber: z.number().int(),
  status: EvalRunStatus,
  summary: EvalSummary.nullable(),
  createdAt: IsoDate,
  finishedAt: IsoDate.nullable(),
})
export type EvalRun = z.infer<typeof EvalRun>

export const ScoreResult = z.object({
  kind: z.string(),
  pass: z.boolean(),
  score: z.number().optional(),
  reason: z.string(),
})
export type ScoreResult = z.infer<typeof ScoreResult>

export const EvalResult = z.object({
  id: Id,
  evalRunId: Id,
  caseId: Id,
  runId: Id,
  pass: z.boolean(),
  scores: z.array(ScoreResult),
  costUsd: z.number(),
  latencyMs: z.number(),
})
export type EvalResult = z.infer<typeof EvalResult>
