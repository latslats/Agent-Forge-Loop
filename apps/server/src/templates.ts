import {
  AgentDefinition,
  type AgentDefinitionInput,
  DEFAULT_MODEL,
  type TemplateSummary,
} from '@agentforgeloop/shared'
import { NotFoundError } from './errors.ts'

type Template = TemplateSummary & { definition: AgentDefinition }

const BUILTIN = 'builtin'

const SUPPORT_TRIAGE = AgentDefinition.parse({
  name: 'Support email triage',
  model: DEFAULT_MODEL,
  description:
    'Triage inbound support emails: classify, draft a reply, block if it contains card numbers, ask a human before sending',
  principles: [
    '- Be friendly and concise.',
    '- Never invent order details such as tracking numbers, dates or amounts.',
    '- Escalate refunds over $50 to a person.',
  ].join('\n'),
  nodes: [
    { id: 'trigger', type: 'trigger', label: 'Email received', position: { x: 80, y: 200 } },
    {
      id: 'classify',
      type: 'ai',
      label: 'Classify & draft reply',
      prompt:
        'Classify the email as billing, shipping, product or other, then draft a short reply. Return JSON with keys category and reply.',
      position: { x: 360, y: 200 },
    },
    {
      id: 'pii',
      type: 'check',
      label: 'Block card numbers',
      check: {
        kind: 'regex',
        pattern: '\\b(?:\\d[ -]?){13,19}\\b',
        flags: '',
        mode: 'block',
        target: 'input',
      },
      onFail: 'route',
      position: { x: 640, y: 200 },
    },
    {
      id: 'review',
      type: 'approval',
      label: 'Human review before send',
      message: 'Approve the drafted reply?',
      position: { x: 920, y: 200 },
    },
    {
      id: 'send',
      type: 'output',
      label: 'Send reply',
      template: '{{prev.reply}}',
      position: { x: 1200, y: 200 },
    },
    {
      id: 'blocked',
      type: 'output',
      label: 'Blocked — handle manually',
      position: { x: 640, y: 380 },
    },
  ],
  edges: [
    { id: 'e1', from: 'trigger', to: 'classify' },
    { id: 'e2', from: 'classify', to: 'pii' },
    { id: 'e3', from: 'pii', to: 'review', label: 'pass' },
    { id: 'e4', from: 'pii', to: 'blocked', label: 'fail' },
    { id: 'e5', from: 'review', to: 'send' },
  ],
} satisfies AgentDefinitionInput)

const INVOICE_EXTRACTION = AgentDefinition.parse({
  name: 'Invoice data extraction',
  model: DEFAULT_MODEL,
  description: 'Read an invoice and extract the vendor, total and due date as checked JSON.',
  principles: '- Use only what the invoice says. Use null for a missing due date.',
  nodes: [
    { id: 'trigger', type: 'trigger', label: 'Invoice received', position: { x: 80, y: 200 } },
    {
      id: 'extract',
      type: 'ai',
      label: 'Extract vendor, total, due date',
      prompt:
        'Read the invoice text in the input. Return only JSON with the keys "vendor" (string), "total" (number, in the invoice currency) and "dueDate" (string as YYYY-MM-DD, or null when the invoice has no due date).',
      position: { x: 360, y: 200 },
    },
    {
      id: 'check-json',
      type: 'check',
      label: 'Fields match the schema',
      check: {
        kind: 'json_schema',
        target: 'output',
        schema: {
          type: 'object',
          properties: {
            vendor: { type: 'string' },
            total: { type: 'number' },
            dueDate: { type: ['string', 'null'] },
          },
          required: ['vendor', 'total', 'dueDate'],
          additionalProperties: false,
        },
      },
      onFail: 'stop',
      position: { x: 640, y: 200 },
    },
    {
      id: 'output',
      type: 'output',
      label: 'Extracted fields',
      template: '{{prev}}',
      position: { x: 920, y: 200 },
    },
  ],
  edges: [
    { id: 'e1', from: 'trigger', to: 'extract' },
    { id: 'e2', from: 'extract', to: 'check-json' },
    { id: 'e3', from: 'check-json', to: 'output' },
  ],
} satisfies AgentDefinitionInput)

const NEWS_DIGEST = AgentDefinition.parse({
  name: 'Daily news digest',
  model: DEFAULT_MODEL,
  description:
    'Fetch a news page from the run input, summarize it into five bullets, and wait for approval before publishing.',
  principles: '- Use only facts from the fetched page.\n- Never publish without approval.',
  nodes: [
    { id: 'trigger', type: 'trigger', label: 'Daily run with a URL', position: { x: 80, y: 200 } },
    {
      id: 'fetch',
      type: 'ai',
      label: 'Fetch the page',
      prompt:
        'The input is an https URL. Call http_request with that URL and method GET. Reply with the readable text of the page only.',
      tools: [{ connectionId: BUILTIN, tool: 'http_request' }],
      position: { x: 360, y: 200 },
    },
    {
      id: 'summarize',
      type: 'ai',
      label: 'Summarize into a digest',
      prompt:
        'Summarize the page text in the input as a news digest: five bullets, one sentence each, most important first. Do not add facts that are not in the text.',
      position: { x: 640, y: 200 },
    },
    {
      id: 'review',
      type: 'approval',
      label: 'Approve the digest',
      message: 'Approve the digest before it is published?',
      position: { x: 920, y: 200 },
    },
    {
      id: 'publish',
      type: 'output',
      label: 'Publish digest',
      template: '{{prev}}',
      position: { x: 1200, y: 200 },
    },
  ],
  edges: [
    { id: 'e1', from: 'trigger', to: 'fetch' },
    { id: 'e2', from: 'fetch', to: 'summarize' },
    { id: 'e3', from: 'summarize', to: 'review' },
    { id: 'e4', from: 'review', to: 'publish' },
  ],
} satisfies AgentDefinitionInput)

const templates: Template[] = [
  {
    id: 'support-email-triage',
    name: SUPPORT_TRIAGE.name,
    description: SUPPORT_TRIAGE.description,
    category: 'Support',
    nodeCount: SUPPORT_TRIAGE.nodes.length,
    definition: SUPPORT_TRIAGE,
  },
  {
    id: 'invoice-extraction',
    name: INVOICE_EXTRACTION.name,
    description: INVOICE_EXTRACTION.description,
    category: 'Finance',
    nodeCount: INVOICE_EXTRACTION.nodes.length,
    definition: INVOICE_EXTRACTION,
  },
  {
    id: 'daily-news-digest',
    name: NEWS_DIGEST.name,
    description: NEWS_DIGEST.description,
    category: 'Research',
    nodeCount: NEWS_DIGEST.nodes.length,
    definition: NEWS_DIGEST,
  },
]

export const listTemplates = (): TemplateSummary[] =>
  templates.map(({ definition: _definition, ...summary }) => summary)

export const getTemplate = (id: string): Template => {
  const template = templates.find((item) => item.id === id)
  if (!template) throw new NotFoundError(`Template ${id} not found`)
  return template
}
