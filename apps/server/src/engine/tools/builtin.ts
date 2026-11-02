import { CreateMemoryBody } from '@agentforgeloop/shared'
import { z } from 'zod'
import { createMemory, searchMemories } from '../../db/memories.ts'
import type { ToolDef } from './types.ts'

export const BUILTIN_CONNECTION_ID = 'builtin'

const MAX_BODY_BYTES = 50 * 1024
const TIMEOUT_MS = 10_000

const isHttps = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

const HttpRequestInput = z.object({
  url: z.string().refine(isHttps, 'url must be an https URL'),
  method: z.enum(['GET', 'POST']),
  body: z.string().nullable(),
})

const nowTool: ToolDef = {
  connectionId: BUILTIN_CONNECTION_ID,
  name: 'now',
  description: 'Get the current date and time as ISO 8601, and the server time zone.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  run: async () => ({
    output: {
      iso: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    isError: false,
  }),
}

const httpRequestTool: ToolDef = {
  connectionId: BUILTIN_CONNECTION_ID,
  name: 'http_request',
  description: 'Call an https URL. Returns the status and the body (truncated to 50 KB).',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'An https URL' },
      method: { type: 'string', enum: ['GET', 'POST'] },
      body: { type: ['string', 'null'], description: 'Request body for POST, or null' },
    },
    required: ['url', 'method', 'body'],
    additionalProperties: false,
  },
  run: async (input, signal) => {
    const request = HttpRequestInput.parse(input)
    const response = await fetch(request.url, {
      method: request.method,
      body: request.body ?? undefined,
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    })
    const text = await response.text()
    return {
      output: {
        status: response.status,
        body: Buffer.from(text).subarray(0, MAX_BODY_BYTES).toString('utf8'),
      },
      isError: response.status >= 400,
    }
  },
}

const memorySaveTool: ToolDef = {
  connectionId: BUILTIN_CONNECTION_ID,
  name: 'memory_save',
  description: 'Remember a fact about this agent for later runs. Keep it short and self-contained.',
  inputSchema: {
    type: 'object',
    properties: { content: { type: 'string', description: 'The fact to remember' } },
    required: ['content'],
    additionalProperties: false,
  },
  run: async (input, _signal, ctx) => {
    if (!ctx) throw new Error('memory_save needs a run context')
    const { content } = CreateMemoryBody.parse(input)
    createMemory(ctx.db, ctx.agentId, content, ctx.runId)
    return { output: { saved: true }, isError: false }
  },
}

const memorySearchTool: ToolDef = {
  connectionId: BUILTIN_CONNECTION_ID,
  name: 'memory_search',
  description:
    'Find facts this agent saved earlier. Matches text anywhere in the fact, ignoring case.',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Text to look for' } },
    required: ['query'],
    additionalProperties: false,
  },
  run: async (input, _signal, ctx) => {
    if (!ctx) throw new Error('memory_search needs a run context')
    const { query } = z.object({ query: z.string().min(1) }).parse(input)
    const matches = searchMemories(ctx.db, ctx.agentId, query).map((memory) => memory.content)
    return { output: { matches }, isError: false }
  },
}

export const builtinTools: ToolDef[] = [nowTool, httpRequestTool, memorySaveTool, memorySearchTool]
