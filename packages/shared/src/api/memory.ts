import { z } from 'zod'

/** Body of POST /api/agents/:id/memories. */
export const CreateMemoryBody = z.object({ content: z.string().min(1) })
export type CreateMemoryBody = z.infer<typeof CreateMemoryBody>

export const memoryRoutes = {
  /** GET: Memory[] newest first. POST CreateMemoryBody: 201 Memory. DELETE: 204, clears all of the agent's memories. */
  memories: (agentId: string) => `/api/agents/${agentId}/memories`,
  /** DELETE: 204, no body. */
  memory: (id: string) => `/api/memories/${id}`,
} as const
