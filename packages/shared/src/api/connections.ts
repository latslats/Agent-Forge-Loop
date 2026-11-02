import { z } from 'zod'
import { Connection, McpConfig, ToolDescriptor } from '../schema/connection.ts'

/** Body of POST /api/connections. Created rows are always kind 'mcp'; the 'builtin' row is seeded. */
export const CreateConnectionBody = z.object({ name: z.string().min(1), config: McpConfig })
export type CreateConnectionBody = z.infer<typeof CreateConnectionBody>
export type CreateConnectionBodyInput = z.input<typeof CreateConnectionBody>

export const UpdateConnectionBody = z.object({
  name: z.string().min(1).optional(),
  enabledTools: z.array(z.string()).optional(),
  config: McpConfig.optional(),
})
export type UpdateConnectionBody = z.infer<typeof UpdateConnectionBody>
export type UpdateConnectionBodyInput = z.input<typeof UpdateConnectionBody>

/** A connection as the UI reads it: the tools its server lists and whether the last listing worked. */
export const ConnectionView = Connection.extend({
  tools: z.array(ToolDescriptor),
  status: z.enum(['ok', 'error', 'builtin']),
  error: z.string().nullable(),
})
export type ConnectionView = z.infer<typeof ConnectionView>

export const connectionRoutes = {
  /** GET: ConnectionView[]. POST CreateConnectionBody: 201 ConnectionView after listing the server's tools; 502 { error } when the server cannot be reached. */
  connections: '/api/connections',
  /** PATCH UpdateConnectionBody: 200 ConnectionView. DELETE: 204, no body; the builtin row cannot be deleted (409). */
  connection: (id: string) => `/api/connections/${id}`,
  /** POST, no body: 200 ConnectionView with the tools listed again. */
  refresh: (id: string) => `/api/connections/${id}/refresh`,
} as const
