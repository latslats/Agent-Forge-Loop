import { z } from 'zod'
import { Id, IsoDate } from './common.ts'

/** One fact an agent remembers across runs. `sourceRunId` is set when a run saved it. */
export const Memory = z.object({
  id: Id,
  agentId: Id,
  content: z.string(),
  sourceRunId: Id.nullable(),
  createdAt: IsoDate,
})
export type Memory = z.infer<typeof Memory>
