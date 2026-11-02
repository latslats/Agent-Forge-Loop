import {
  AgentDefinition,
  type AgentDefinitionInput,
  BUILTIN_CONNECTION_ID,
} from '@agentforgeloop/shared'
import { createAgent, listAgents, publishVersion } from './db/agents.ts'
import { type Db, get, nowIso, run } from './db/sqlite.ts'

const EXAMPLE_DRAFT = AgentDefinition.parse({
  name: 'Support email triage',
  // Haiku keeps manual checks and demos cheap; the product default stays Sonnet.
  model: 'claude-haiku-5-5',
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

const BUILTIN_TOOLS = ['now', 'http_request', 'memory_save', 'memory_search']

/** The 'builtin' connection row the Connections page lists. Inserted once, on an empty table. */
const seedBuiltinConnection = (db: Db): void => {
  if (get(db, 'SELECT id FROM connections LIMIT 1')) return
  run(
    db,
    'INSERT INTO connections (id, kind, name, config_json, enabled_tools_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      BUILTIN_CONNECTION_ID,
      'builtin',
      'Built-in tools',
      null,
      JSON.stringify(BUILTIN_TOOLS),
      nowIso(),
    ],
  )
}

export const seedExample = (db: Db): void => {
  seedBuiltinConnection(db)
  if (listAgents(db).length > 0) return
  const agent = createAgent(db, {
    name: EXAMPLE_DRAFT.name,
    description: EXAMPLE_DRAFT.description,
    draft: EXAMPLE_DRAFT,
  })
  publishVersion(db, agent.id, 'Initial version')
}
