export class NotFoundError extends Error {}

/** The request conflicts with the current state, such as deciding an approval twice. */
export class ConflictError extends Error {}

/** A definition that fails validateDefinition. `details` lists each problem. */
export class InvalidDefinitionError extends Error {
  readonly details: string[]

  // Written out, not a parameter property: tsconfig sets erasableSyntaxOnly.
  constructor(details: string[]) {
    super('invalid definition')
    this.details = details
  }
}

/** A well-formed request value that is not valid, such as a cron that does not parse. */
export class ValidationError extends Error {}

/** The model call failed, was refused or cut off, or its reply is not a valid definition. */
export class DraftError extends Error {}

/** The message of a thrown value, for error responses and tool results. */
export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err)
