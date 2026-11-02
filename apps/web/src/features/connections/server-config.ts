import { McpConfig } from '@agentforgeloop/shared'

export type ServerDraft = {
  transport: 'http' | 'stdio'
  url: string
  command: string
  args: string
  env: string
}

export type ServerConfigResult = { ok: true; config: McpConfig } | { ok: false; error: string }

/** Non-empty lines, trimmed. Used for the arguments box. */
export function parseLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/** KEY=value per line. Reports the first line that is not KEY=value so the form can name it. */
export function parseEnvLines(
  text: string,
): { ok: true; env: Record<string, string> } | { ok: false; line: string } {
  const env: Record<string, string> = {}
  for (const line of parseLines(text)) {
    const at = line.indexOf('=')
    if (at <= 0) return { ok: false, line }
    env[line.slice(0, at).trim()] = line.slice(at + 1)
  }
  return { ok: true, env }
}

/** Turns the add-server form into a validated McpConfig, or a message to show above Connect. */
export function buildMcpConfig(draft: ServerDraft): ServerConfigResult {
  if (draft.transport === 'http') {
    const url = draft.url.trim()
    if (!/^https?:\/\/\S+$/.test(url)) {
      return { ok: false, error: 'Enter a URL that starts with http:// or https://.' }
    }
    return { ok: true, config: McpConfig.parse({ transport: 'http', url }) }
  }

  const command = draft.command.trim()
  if (command === '') return { ok: false, error: 'Enter the command that starts the server.' }
  const env = parseEnvLines(draft.env)
  if (!env.ok) return { ok: false, error: `Use KEY=value on each line. Check "${env.line}".` }
  const config = McpConfig.parse({
    transport: 'stdio',
    command,
    args: parseLines(draft.args),
    env: env.env,
  })
  return { ok: true, config }
}
