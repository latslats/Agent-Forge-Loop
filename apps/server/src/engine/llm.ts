import Anthropic from '@anthropic-ai/sdk'
import type { Effort, ModelId } from '@agentforgeloop/shared'
import { z } from 'zod'

export type Usage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** USD per million tokens. */
type Price = { input: number; output: number; cacheRead: number; cacheWrite: number }

export const PRICES: Record<ModelId, Price> = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
}

export const estimateCost = (model: ModelId, usage: Usage): number => {
  const price = PRICES[model]
  return (
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite) /
    1_000_000
  )
}

export type MessageParams = {
  model: ModelId
  effort: Effort
  system: Anthropic.TextBlockParam[]
  messages: Anthropic.MessageParam[]
  tools: Anthropic.Tool[]
  signal: AbortSignal
}

export type MessageResult = {
  message: Anthropic.Message
  usage: Usage
  costUsd: number
  durationMs: number
}

export type Verdict = { pass: boolean; reason: string }

export type JudgeResult = {
  verdict: Verdict
  model: ModelId
  usage: Usage
  costUsd: number
  stopReason: string
  durationMs: number
}

export type Llm = {
  message(params: MessageParams): Promise<MessageResult>
  judge(params: {
    rubric: string
    text: string
    model?: ModelId
    signal?: AbortSignal
  }): Promise<JudgeResult>
}

const MAX_TOKENS = 16000
export const JUDGE_MODEL: ModelId = 'claude-haiku-5-5'
const MISSING_KEY = 'ANTHROPIC_API_KEY is not set (add it to .env)'

const VerdictSchema = z.object({ pass: z.boolean(), reason: z.string() })
const VERDICT_FORMAT = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: { pass: { type: 'boolean' }, reason: { type: 'string' } },
    required: ['pass', 'reason'],
    additionalProperties: false,
  },
}

// Most specific SDK error first. Anything else is passed on unchanged.
const describeError = (err: unknown): Error => {
  if (err instanceof Anthropic.AuthenticationError)
    return new Error('Anthropic rejected the API key (check ANTHROPIC_API_KEY)')
  if (err instanceof Anthropic.RateLimitError)
    return new Error('Anthropic rate limit reached; try again shortly')
  if (err instanceof Anthropic.BadRequestError)
    return new Error(`Anthropic rejected the request: ${err.message}`)
  if (err instanceof Anthropic.APIError)
    return new Error(`Anthropic API error ${err.status}: ${err.message}`)
  return err instanceof Error ? err : new Error(String(err))
}

const finalize = async (request: () => Promise<Anthropic.Message>): Promise<Anthropic.Message> => {
  try {
    return await request()
  } catch (err) {
    throw describeError(err)
  }
}

const toUsage = (usage: Anthropic.Usage): Usage => ({
  inputTokens: usage.input_tokens,
  outputTokens: usage.output_tokens,
  cacheReadTokens: usage.cache_read_input_tokens ?? 0,
  cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
})

/** Without a key every call fails with the same message, so the rest of the app still runs. */
export const createLlm = (apiKey: string | undefined): Llm => {
  if (!apiKey) {
    const missing = (): Promise<never> => Promise.reject(new Error(MISSING_KEY))
    return { message: missing, judge: missing }
  }

  const client = new Anthropic({ apiKey })

  return {
    message: async ({ model, effort, system, messages, tools, signal }) => {
      const started = Date.now()
      const message = await finalize(() =>
        client.messages
          .stream(
            {
              model,
              max_tokens: MAX_TOKENS,
              output_config: { effort },
              system,
              messages,
              ...(tools.length > 0 ? { tools } : {}),
            },
            { signal },
          )
          .finalMessage(),
      )
      const usage = toUsage(message.usage)
      return {
        message,
        usage,
        costUsd: estimateCost(model, usage),
        durationMs: Date.now() - started,
      }
    },

    judge: async ({ rubric, text, model = JUDGE_MODEL, signal }) => {
      const started = Date.now()
      const message = await finalize(() =>
        client.messages
          .stream(
            {
              model,
              max_tokens: MAX_TOKENS,
              output_config: { effort: 'low', format: VERDICT_FORMAT },
              system: 'You grade a text against a rubric. Reply only with the JSON verdict.',
              messages: [{ role: 'user', content: `Rubric:\n${rubric}\n\nText:\n${text}` }],
            },
            { signal },
          )
          .finalMessage(),
      )
      if (message.stop_reason === 'refusal') throw new Error('The judge refused to grade the text')
      if (message.stop_reason === 'max_tokens') throw new Error('The judge output was cut off')
      const raw = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : []))
      const usage = toUsage(message.usage)
      return {
        verdict: VerdictSchema.parse(JSON.parse(raw.join(''))),
        model,
        usage,
        costUsd: estimateCost(model, usage),
        stopReason: message.stop_reason ?? 'none',
        durationMs: Date.now() - started,
      }
    },
  }
}
