import Anthropic from '@anthropic-ai/sdk'
import {
  AgentDefinition,
  type DraftAgentBody,
  type DraftAgentResponse,
  type ModelId,
  validateDefinition,
} from '@agentforgeloop/shared'
import { z } from 'zod'
import { DraftError } from './errors.ts'

export type DraftModelParams = {
  model: ModelId
  system: string
  messages: Anthropic.MessageParam[]
}

/** Returns the model's reply text. Tests inject a fake; the default calls Claude. */
export type DraftModelCall = (params: DraftModelParams) => Promise<string>

const MAX_TOKENS = 16000

const INSTRUCTIONS = `You design AI agents for Agent Forge Loop, a canvas app. Turn the user's description into one AgentDefinition, returned as JSON.

Node kinds (field "type"):
- trigger: where a run starts. Exactly one.
- ai: calls Claude with "prompt" (its instructions). Optional "tools": [{ "connectionId": "builtin", "tool": "http_request" }] or "now". Add tools only when the description needs them; otherwise use [].
- code: JavaScript "source" run with { input, vars, prev }; its return value becomes prev. Use only for plain data transforms.
- check: validates the previous output. "check.kind" is one of regex (pattern, flags, mode "block" or "require", target "input" or "output"), llm_judge (rubric, target), cost_cap (maxUsd), tool_allowlist (tools). "onFail": "stop" ends the run; "route" follows the "fail" edge.
- approval: pauses the run until a person approves. "message" is shown to that person.
- branch: JavaScript "expression" that is true or false; follows the "true" or "false" edge.
- output: ends the run. "template" may use {{prev.field}}. An output node has no outgoing edges.

Edges: { "id", "from", "to", "label" }. A check leaves by "pass" or "fail"; a branch by "true" or "false"; other nodes have no label.

Rules:
- Use a check for any sensitive data (card numbers, personal data).
- Use an approval before any external side effect (sending, posting, paying).
- Exactly one trigger and at least one output.
- Every node except the trigger needs an incoming edge. Every node except an output needs an outgoing edge.
- Give each node a unique short id and a short label. Set every position to { "x": 0, "y": 0 }; the app lays out the canvas.
- Fill principles with a few markdown bullet lines of rules for the agent. Set memory to { "enabled": false }, effort to "medium", and maxTurns to 8 on ai nodes.
- Write concrete prompts. When a later node reads fields, ask the earlier ai node to return JSON with those keys.`

// Structured outputs accept a subset of JSON Schema: no range or length limits, no $schema, and
// every object must say additionalProperties: false. zod still enforces the dropped limits on the
// reply, so only the model's guidance is lost. Keys inside "properties" are field names, not keywords.
const UNSUPPORTED_KEYWORDS = new Set([
  '$schema',
  'default',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'maxItems',
  'maxLength',
  'maximum',
  'minItems',
  'minLength',
  'minimum',
  'multipleOf',
  'pattern',
  'propertyNames',
])

const toStructuredSchema = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(toStructuredSchema)
  if (typeof node !== 'object' || node === null) return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue
    if (key === 'properties' && typeof value === 'object' && value !== null) {
      out[key] = Object.fromEntries(
        Object.entries(value).map(([name, schema]) => [name, toStructuredSchema(schema)]),
      )
    } else {
      out[key === 'oneOf' ? 'anyOf' : key] = toStructuredSchema(value)
    }
  }
  // A z.record becomes a closed empty object: the API rejects free-form maps, and the draft never
  // needs them (the instructions do not offer json_schema checks).
  if (out.type === 'object') out.additionalProperties = false
  return out
}

/** The shape the reply must follow. It is shown to the model in the system prompt. */
export const DRAFT_SCHEMA = toStructuredSchema(
  z.toJSONSchema(AgentDefinition, { io: 'input' }),
) as Record<string, unknown>

const SYSTEM_PROMPT = `${INSTRUCTIONS}

Reply with only one JSON object that matches this JSON Schema (no prose, no code fence):
${JSON.stringify(DRAFT_SCHEMA)}`

type JsonObject = Record<string, unknown>

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Models sometimes write null for an optional field; the schema means "absent", so drop those.
const withoutNulls = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutNulls)
  if (!isObject(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== null)
      .map(([key, item]) => [key, withoutNulls(item)]),
  )
}

/** Takes the JSON object out of a reply, even when it arrives inside a code fence. */
const parseReply = (text: string): unknown => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end < start) throw new SyntaxError('no JSON object found')
  return JSON.parse(text.slice(start, end + 1))
}

const TOOL_NAME = 'propose_agent'

const modelError = (err: unknown): DraftError => {
  if (err instanceof DraftError) return err
  return new DraftError(err instanceof Error ? err.message : 'The model call failed')
}

const replyText = (message: Anthropic.Message): string => {
  if (message.stop_reason === 'refusal')
    throw new DraftError('The model declined to draft this agent')
  if (message.stop_reason === 'max_tokens')
    throw new DraftError('The draft was cut off; try a shorter description')
  // A tool call carries the definition as its input; plain text carries it as JSON.
  return message.content
    .flatMap((block) =>
      block.type === 'text'
        ? [block.text]
        : block.type === 'tool_use'
          ? [JSON.stringify(block.input)]
          : [],
    )
    .join('')
}

/**
 * The default model call, streamed to completion. The schema goes in as structured output. If the
 * API rejects that request (a 400), the same definition is asked for through a tool instead. The
 * tool is not strict: the API refuses the grammar of this schema in strict mode.
 */
export const callDraftModel =
  (apiKey: string | undefined): DraftModelCall =>
  async ({ model, system, messages }) => {
    if (!apiKey) throw new DraftError('ANTHROPIC_API_KEY is not set (add it to .env)')
    const client = new Anthropic({ apiKey })
    const send = (params: Anthropic.MessageCreateParams) =>
      client.messages.stream(params).finalMessage()
    const base = { model, max_tokens: MAX_TOKENS, system, messages }

    try {
      return replyText(
        await send({
          ...base,
          output_config: { format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
        }),
      )
    } catch (err) {
      if (!(err instanceof Anthropic.BadRequestError)) throw err
    }
    const tool: Anthropic.Tool = {
      name: TOOL_NAME,
      description: 'Propose the complete AgentDefinition for the described agent.',
      input_schema: DRAFT_SCHEMA as Anthropic.Tool.InputSchema,
    }
    return replyText(await send({ ...base, tools: [tool] }))
  }

type Attempt = { reply: string; definition: AgentDefinition | null; problems: string[] }

const attempt = async (
  call: DraftModelCall,
  model: ModelId,
  messages: Anthropic.MessageParam[],
): Promise<Attempt> => {
  let reply: string
  try {
    reply = await call({ model, system: SYSTEM_PROMPT, messages })
  } catch (err) {
    throw modelError(err)
  }
  let raw: unknown
  try {
    raw = parseReply(reply)
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'invalid JSON'
    return { reply, definition: null, problems: [`definition: the reply is not JSON (${detail})`] }
  }
  const parsed = AgentDefinition.safeParse(withoutNulls(raw))
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || 'definition'}: ${issue.message}`,
    )
    return { reply, definition: null, problems }
  }
  return { reply, definition: parsed.data, problems: validateDefinition(parsed.data) }
}

/**
 * Places nodes by depth from the trigger (x) and by their index among nodes at that depth (y).
 * Nodes the trigger cannot reach go in one extra column at the end.
 */
export const autoLayout = (definition: AgentDefinition): AgentDefinition => {
  const depth = new Map<string, number>()
  for (const node of definition.nodes) if (node.type === 'trigger') depth.set(node.id, 0)
  // Relax each edge once per node; the result is the shortest distance from the trigger.
  for (let pass = 0; pass < definition.nodes.length; pass++) {
    for (const edge of definition.edges) {
      const from = depth.get(edge.from)
      if (from === undefined) continue
      const known = depth.get(edge.to)
      if (known === undefined || known > from + 1) depth.set(edge.to, from + 1)
    }
  }
  const unreachable = Math.max(-1, ...depth.values()) + 1
  const rowsByDepth = new Map<number, number>()
  const nodes = definition.nodes.map((node) => {
    const column = depth.get(node.id) ?? unreachable
    const row = rowsByDepth.get(column) ?? 0
    rowsByDepth.set(column, row + 1)
    return { ...node, position: { x: 80 + 280 * column, y: 200 + 180 * row } }
  })
  return { ...definition, nodes }
}

const describeProblems = (problems: string[]): string =>
  problems.map((problem) => `- ${problem}`).join('\n')

/**
 * Drafts a definition from a description. A definition that fails parsing or validation gets one
 * repair round that sends the problems back. Problems left after that are returned with the draft.
 */
export const draftAgent = async (
  body: DraftAgentBody,
  call: DraftModelCall,
): Promise<DraftAgentResponse> => {
  const first: Anthropic.MessageParam[] = [{ role: 'user', content: body.description }]
  let result = await attempt(call, body.model, first)
  if (result.problems.length > 0) {
    const repair: Anthropic.MessageParam[] = [
      ...first,
      { role: 'assistant', content: result.reply },
      {
        role: 'user',
        content: `This draft has problems:\n${describeProblems(result.problems)}\nReturn the complete corrected AgentDefinition.`,
      },
    ]
    result = await attempt(call, body.model, repair)
  }
  if (!result.definition) {
    throw new DraftError(
      `The model returned no valid agent definition: ${result.problems.join('; ')}`,
    )
  }
  // Each AI step uses the dialog's model too: a step's own model would override the agent's.
  const nodes = result.definition.nodes.map((node) =>
    node.type === 'ai' ? { ...node, model: body.model } : node,
  )
  const definition = autoLayout({ ...result.definition, nodes, model: body.model })
  return { definition, problems: result.problems }
}
