import type { Context } from 'hono'

/**
 * The JSON body of a request. An empty body counts as {} so zod reports missing fields.
 * Malformed JSON throws a SyntaxError, which app.ts maps to 400, so a broken body is never
 * mistaken for an empty one.
 */
export const readJson = async (c: Context): Promise<unknown> => {
  const text = await c.req.text()
  return text === '' ? {} : JSON.parse(text)
}
