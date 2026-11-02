import type { CheckConfig, Node as DefNode } from '@agentforgeloop/shared'

const firstLine = (text: string): string => text.split('\n')[0]?.trim() ?? ''

function checkSummary(check: CheckConfig): string {
  switch (check.kind) {
    case 'regex':
      return `regex · ${check.mode}`
    case 'json_schema':
    case 'llm_judge':
      return `${check.kind} · ${check.target}`
    case 'cost_cap':
      return `cost cap · $${check.maxUsd}`
    case 'tool_allowlist':
      return `tool allowlist · ${check.tools.length} tools`
  }
}

/** The one line a node card shows under its label. */
export function nodeSummary(node: DefNode): string {
  switch (node.type) {
    case 'trigger':
      return 'Starts the run'
    case 'ai':
      return node.prompt.trim().slice(0, 60) || 'No prompt yet'
    case 'code':
      return firstLine(node.source) || 'No code yet'
    case 'check':
      return checkSummary(node.check)
    case 'approval':
      return node.message || 'No message yet'
    case 'branch':
      return node.expression.trim() || 'No condition yet'
    case 'output':
      return node.template.trim() || 'Passes the result through'
  }
}
