import { z } from 'zod'
import { Id, IsoDate } from './common.ts'

export const BUILTIN_CONNECTION_ID = 'builtin'

export const McpConfig = z.object({
  transport: z.enum(['http', 'stdio']),
  url: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
})
export type McpConfig = z.infer<typeof McpConfig>

export const Connection = z.object({
  id: Id,
  kind: z.enum(['builtin', 'mcp']),
  name: z.string(),
  config: McpConfig.nullable(),
  enabledTools: z.array(z.string()).default([]),
  createdAt: IsoDate,
})
export type Connection = z.infer<typeof Connection>

export const ToolDescriptor = z.object({
  name: z.string(),
  description: z.string().default(''),
  inputSchema: z.record(z.string(), z.unknown()),
})
export type ToolDescriptor = z.infer<typeof ToolDescriptor>
