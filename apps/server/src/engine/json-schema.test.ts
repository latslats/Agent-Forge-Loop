import { describe, expect, it } from 'vitest'
import { validate } from './json-schema.ts'

describe('validate', () => {
  it('returns no problems for a value that matches', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'integer' } },
      required: ['name'],
    }
    expect(validate(schema, { name: 'Ana', age: 30 })).toEqual([])
  })

  it('checks the type, including integer, and arrays of types for nullable values', () => {
    expect(validate({ type: 'string' }, 5)).toEqual(['$ must be string'])
    expect(validate({ type: 'integer' }, 1.5)).toEqual(['$ must be integer'])
    expect(validate({ type: 'number' }, 1.5)).toEqual([])
    expect(validate({ type: ['string', 'null'] }, null)).toEqual([])
    expect(validate({ type: ['string', 'null'] }, 3)).toEqual(['$ must be string or null'])
    expect(validate({ type: 'array' }, {})).toEqual(['$ must be array'])
  })

  it('reports missing required keys and nested problems with their path', () => {
    const schema = {
      type: 'object',
      properties: {
        order: {
          type: 'object',
          properties: { total: { type: 'number' } },
          required: ['total'],
        },
      },
      required: ['order'],
    }
    expect(validate(schema, {})).toEqual(['$.order is required'])
    expect(validate(schema, { order: {} })).toEqual(['$.order.total is required'])
    expect(validate(schema, { order: { total: 'ten' } })).toEqual(['$.order.total must be number'])
  })

  it('rejects extra keys only when additionalProperties is false', () => {
    const closed = {
      type: 'object',
      properties: { a: { type: 'string' } },
      additionalProperties: false,
    }
    expect(validate(closed, { a: 'x', b: 1 })).toEqual(['$.b is not allowed'])

    const open = { type: 'object', properties: { a: { type: 'string' } } }
    expect(validate(open, { a: 'x', b: 1 })).toEqual([])
  })

  it('validates every array item and names its index', () => {
    const schema = { type: 'array', items: { type: 'number' } }
    expect(validate(schema, [1, 'two', 3])).toEqual(['$[1] must be number'])
  })

  it('checks enum and const by their JSON value', () => {
    expect(validate({ enum: ['red', 'blue'] }, 'green')).toEqual(['$ must be one of "red", "blue"'])
    expect(validate({ enum: ['red', 'blue'] }, 'red')).toEqual([])
    expect(validate({ const: 2 }, 3)).toEqual(['$ must be 2'])
    expect(validate({ const: 2 }, 2)).toEqual([])
  })

  it('checks numeric bounds', () => {
    expect(validate({ minimum: 1, maximum: 5 }, 0)).toEqual(['$ must be >= 1'])
    expect(validate({ minimum: 1, maximum: 5 }, 6)).toEqual(['$ must be <= 5'])
    expect(validate({ minimum: 1, maximum: 5 }, 5)).toEqual([])
  })

  it('counts string length in code points, and checks the pattern', () => {
    expect(validate({ minLength: 2 }, 'a')).toEqual(['$ must be at least 2 characters'])
    expect(validate({ maxLength: 2 }, 'abc')).toEqual(['$ must be at most 2 characters'])
    expect(validate({ maxLength: 2 }, '😀😀')).toEqual([])
    expect(validate({ pattern: '^\\d+$' }, '12a')).toEqual(['$ must match /^\\d+$/'])
    expect(validate({ pattern: '^\\d+$' }, '123')).toEqual([])
  })

  it('ignores keywords it does not support', () => {
    expect(validate({ format: 'email', anyOf: [{ type: 'number' }] }, 'not an email')).toEqual([])
  })
})
