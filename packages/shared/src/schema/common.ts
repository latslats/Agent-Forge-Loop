import { z } from 'zod'

export const MODEL_IDS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'] as const
export const ModelId = z.enum(MODEL_IDS)
export type ModelId = z.infer<typeof ModelId>
export const DEFAULT_MODEL: ModelId = 'claude-sonnet-5-5'
export const MODEL_LABELS: Record<ModelId, string> = {
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-haiku-5-5': 'Claude Haiku 5.5',
}

export const Effort = z.enum(['low', 'medium', 'high'])
export type Effort = z.infer<typeof Effort>
export const DEFAULT_EFFORT: Effort = 'medium'

export const Id = z.string().min(1)
export type Id = z.infer<typeof Id>

/** ISO-8601 timestamp string. */
export const IsoDate = z.string()
export type IsoDate = z.infer<typeof IsoDate>

export const EdgeLabel = z.enum(['pass', 'fail', 'true', 'false'])
export type EdgeLabel = z.infer<typeof EdgeLabel>
