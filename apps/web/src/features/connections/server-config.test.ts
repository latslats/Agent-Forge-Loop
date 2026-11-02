import { describe, expect, it } from 'vitest'
import { buildMcpConfig, parseEnvLines, parseLines } from './server-config.ts'

const blank = { transport: 'http', url: '', command: '', args: '', env: '' } as const

describe('parseLines', () => {
  it('trims lines and drops blank ones', () => {
    expect(parseLines('  -y \n\n@scope/server  \n')).toEqual(['-y', '@scope/server'])
  })
})

describe('parseEnvLines', () => {
  it('splits each line at the first equals sign', () => {
    expect(parseEnvLines('TOKEN=a=b\nMODE=dev')).toEqual({
      ok: true,
      env: { TOKEN: 'a=b', MODE: 'dev' },
    })
  })

  it('reports the first line without KEY=value', () => {
    expect(parseEnvLines('MODE=dev\njust-a-word')).toEqual({ ok: false, line: 'just-a-word' })
  })
})

describe('buildMcpConfig', () => {
  it('accepts an http URL', () => {
    expect(buildMcpConfig({ ...blank, url: ' https://example.com/mcp ' })).toEqual({
      ok: true,
      config: { transport: 'http', args: [], env: {}, url: 'https://example.com/mcp' },
    })
  })

  it('rejects a URL without http or https', () => {
    expect(buildMcpConfig({ ...blank, url: 'example.com/mcp' }).ok).toBe(false)
  })

  it('builds a stdio config from command, args and env', () => {
    const result = buildMcpConfig({
      transport: 'stdio',
      url: '',
      command: 'npx',
      args: '-y\n@scope/server',
      env: 'API_KEY=abc',
    })
    expect(result).toEqual({
      ok: true,
      config: {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@scope/server'],
        env: { API_KEY: 'abc' },
      },
    })
  })

  it('requires a command for stdio', () => {
    const result = buildMcpConfig({ ...blank, transport: 'stdio' })
    expect(result).toEqual({ ok: false, error: 'Enter the command that starts the server.' })
  })

  it('names the bad env line', () => {
    const result = buildMcpConfig({ ...blank, transport: 'stdio', command: 'node', env: 'oops' })
    expect(result).toEqual({ ok: false, error: 'Use KEY=value on each line. Check "oops".' })
  })
})
