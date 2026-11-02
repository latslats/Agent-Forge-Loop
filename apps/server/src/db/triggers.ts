import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  type CreateTriggerBody,
  Trigger,
  TriggerConfig,
  TriggerView,
  triggerRoutes,
  type UpdateTriggerBody,
} from '@agentforgeloop/shared'
import { Cron } from 'croner'
import { ConflictError, NotFoundError, ValidationError } from '../errors.ts'
import { all, type Db, get, newId, nowIso, run } from './sqlite.ts'

type TriggerRow = {
  id: string
  agent_id: string
  kind: string
  config_json: string
  enabled: number
  created_at: string
}

const toTrigger = (row: TriggerRow): Trigger =>
  Trigger.parse({
    id: row.id,
    agentId: row.agent_id,
    kind: row.kind,
    config: TriggerConfig.parse(JSON.parse(row.config_json)),
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  })

const toView = (row: TriggerRow): TriggerView => {
  const trigger = toTrigger(row)
  const webhookUrl =
    trigger.config.kind === 'webhook'
      ? triggerRoutes.hook(trigger.agentId, trigger.config.secret)
      : null
  return TriggerView.parse({ ...trigger, webhookUrl })
}

/** A 32-character hex secret, 128 bits of randomness. */
export const newSecret = (): string => randomBytes(16).toString('hex')

/** Compares two secrets in constant time. Both are hashed first so their lengths never matter. */
export const secretMatches = (expected: string, given: string): boolean =>
  timingSafeEqual(
    createHash('sha256').update(expected).digest(),
    createHash('sha256').update(given).digest(),
  )

/** The problem with a schedule, as the API reports it, or null when it is valid. */
export const scheduleProblem = (cron: string, timezone: string): string | null => {
  try {
    new Cron(cron, { paused: true }, () => {}).stop()
  } catch {
    return 'invalid cron'
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
  } catch {
    return 'invalid timezone'
  }
  return null
}

const assertAgent = (db: Db, agentId: string): void => {
  if (!get(db, 'SELECT id FROM agents WHERE id = ?', [agentId]))
    throw new NotFoundError(`Agent ${agentId} not found`)
}

const assertSchedule = (cron: string, timezone: string): void => {
  const problem = scheduleProblem(cron, timezone)
  if (problem) throw new ValidationError(problem)
}

export const listTriggers = (db: Db, agentId: string): TriggerView[] => {
  assertAgent(db, agentId)
  return all<TriggerRow>(
    db,
    'SELECT * FROM triggers WHERE agent_id = ? ORDER BY created_at, rowid',
    [agentId],
  ).map(toView)
}

export const getTrigger = (db: Db, id: string): Trigger => {
  const row = get<TriggerRow>(db, 'SELECT * FROM triggers WHERE id = ?', [id])
  if (!row) throw new NotFoundError(`Trigger ${id} not found`)
  return toTrigger(row)
}

export const createTrigger = (db: Db, agentId: string, body: CreateTriggerBody): TriggerView => {
  assertAgent(db, agentId)
  const config: TriggerConfig =
    body.kind === 'schedule'
      ? { kind: 'schedule', cron: body.cron, timezone: body.timezone }
      : { kind: 'webhook', secret: newSecret() }
  if (config.kind === 'schedule') assertSchedule(config.cron, config.timezone)
  const id = newId()
  run(
    db,
    'INSERT INTO triggers (id, agent_id, kind, config_json, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)',
    [id, agentId, config.kind, JSON.stringify(config), nowIso()],
  )
  return toView(get<TriggerRow>(db, 'SELECT * FROM triggers WHERE id = ?', [id]) as TriggerRow)
}

/** Only the fields that are given change. cron and timezone apply to schedules only. */
export const updateTrigger = (db: Db, id: string, patch: UpdateTriggerBody): TriggerView => {
  const current = getTrigger(db, id)
  let config = current.config
  if (patch.cron !== undefined || patch.timezone !== undefined) {
    if (config.kind !== 'schedule') throw new ConflictError('only a schedule has a cron')
    config = {
      kind: 'schedule',
      cron: patch.cron ?? config.cron,
      timezone: patch.timezone ?? config.timezone,
    }
  }
  if (config.kind === 'schedule') assertSchedule(config.cron, config.timezone)
  run(db, 'UPDATE triggers SET config_json = ?, enabled = ? WHERE id = ?', [
    JSON.stringify(config),
    (patch.enabled ?? current.enabled) ? 1 : 0,
    id,
  ])
  return toView(get<TriggerRow>(db, 'SELECT * FROM triggers WHERE id = ?', [id]) as TriggerRow)
}

export const deleteTrigger = (db: Db, id: string): void => {
  if (run(db, 'DELETE FROM triggers WHERE id = ?', [id]) === 0)
    throw new NotFoundError(`Trigger ${id} not found`)
}

/** Enabled schedule triggers, for the scheduler to register. */
export const listEnabledSchedules = (db: Db): Trigger[] =>
  all<TriggerRow>(db, "SELECT * FROM triggers WHERE kind = 'schedule' AND enabled = 1").map(
    toTrigger,
  )

/** The enabled webhook of this agent whose secret matches, if any. */
export const findWebhook = (db: Db, agentId: string, secret: string): Trigger | undefined =>
  all<TriggerRow>(
    db,
    "SELECT * FROM triggers WHERE agent_id = ? AND kind = 'webhook' AND enabled = 1",
    [agentId],
  )
    .map(toTrigger)
    .find(
      (trigger) =>
        trigger.config.kind === 'webhook' && secretMatches(trigger.config.secret, secret),
    )

/** Why a scheduled run must not start for this agent, or null when it may start. */
export const scheduleSkipReason = (db: Db, agentId: string): string | null => {
  const agent = get<{ status: string; current_version: number | null }>(
    db,
    'SELECT status, current_version FROM agents WHERE id = ?',
    [agentId],
  )
  if (!agent) return 'agent deleted'
  if (agent.status === 'paused') return 'agent is paused'
  if (agent.current_version === null) return 'agent has no version'
  return null
}

/** Throws NotFoundError when no enabled webhook matches, or ConflictError when the agent cannot run now. */
export const resolveWebhook = (db: Db, agentId: string, secret: string): void => {
  if (!findWebhook(db, agentId, secret)) throw new NotFoundError('not found')
  const reason = scheduleSkipReason(db, agentId)
  if (reason) throw new ConflictError(reason)
}
