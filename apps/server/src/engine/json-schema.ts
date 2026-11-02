// Validates a value against a subset of JSON Schema. Supported keywords: type (one name or an
// array of names, including 'integer' and 'null'; nullable is ["string", "null"]), properties,
// required, additionalProperties (boolean only), items (one schema), enum, const, minimum,
// maximum, minLength, maxLength and pattern. Every other keyword is ignored.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// An unknown type name matches anything, because the keyword is ignored.
const matchesType = (value: unknown, type: unknown): boolean => {
  switch (type) {
    case 'null':
      return value === null
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'number':
      return typeof value === 'number'
    case 'string':
      return typeof value === 'string'
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return isRecord(value)
    default:
      return true
  }
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

const checkValue = (
  schema: Record<string, unknown>,
  value: unknown,
  path: string,
  problems: string[],
): void => {
  const types = schema.type === undefined ? undefined : [schema.type].flat()
  if (types !== undefined && !types.some((type) => matchesType(value, type))) {
    problems.push(`${path} must be ${types.map((type) => String(type)).join(' or ')}`)
    return
  }

  const allowed = schema.enum
  if (Array.isArray(allowed) && !allowed.some((option) => sameJson(option, value)))
    problems.push(
      `${path} must be one of ${allowed.map((option) => JSON.stringify(option)).join(', ')}`,
    )
  if (Object.hasOwn(schema, 'const') && !sameJson(schema.const, value))
    problems.push(`${path} must be ${JSON.stringify(schema.const)}`)

  if (typeof value === 'number') {
    const { minimum, maximum } = schema
    if (typeof minimum === 'number' && value < minimum)
      problems.push(`${path} must be >= ${minimum}`)
    if (typeof maximum === 'number' && value > maximum)
      problems.push(`${path} must be <= ${maximum}`)
  }

  if (typeof value === 'string') {
    const length = [...value].length
    const { minLength, maxLength, pattern } = schema
    if (typeof minLength === 'number' && length < minLength)
      problems.push(`${path} must be at least ${minLength} characters`)
    if (typeof maxLength === 'number' && length > maxLength)
      problems.push(`${path} must be at most ${maxLength} characters`)
    if (typeof pattern === 'string' && !new RegExp(pattern).test(value))
      problems.push(`${path} must match /${pattern}/`)
  }

  const items = schema.items
  if (Array.isArray(value) && isRecord(items)) {
    for (const [index, item] of value.entries()) {
      checkValue(items, item, `${path}[${index}]`, problems)
    }
  }

  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {}
    const required: unknown[] = Array.isArray(schema.required) ? schema.required : []
    for (const key of required) {
      if (typeof key === 'string' && !Object.hasOwn(value, key))
        problems.push(`${path}.${key} is required`)
    }
    for (const [key, sub] of Object.entries(properties)) {
      if (Object.hasOwn(value, key) && isRecord(sub))
        checkValue(sub, value[key], `${path}.${key}`, problems)
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) problems.push(`${path}.${key} is not allowed`)
      }
    }
  }
}

/** The problems found, each as "path message" (the root is "$"). An empty array means valid. */
export const validate = (schema: Record<string, unknown>, value: unknown): string[] => {
  const problems: string[] = []
  checkValue(schema, value, '$', problems)
  return problems
}
