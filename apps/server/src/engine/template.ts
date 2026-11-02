import type { Scope } from './sandbox.ts'

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g

const lookup = (root: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (current, key) =>
        typeof current === 'object' && current !== null && Object.hasOwn(current, key)
          ? (current as Record<string, unknown>)[key]
          : undefined,
      root,
    )

const toText = (value: unknown): string => {
  if (value === undefined) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** Replaces each {{ path }} (a dotted path over { input, vars, prev }). Missing values become ''. */
export const render = (template: string, scope: Scope): string => {
  const root = { input: scope.input, vars: scope.vars, prev: scope.prev }
  return template.replace(PLACEHOLDER, (_match, path: string) => toText(lookup(root, path)))
}
