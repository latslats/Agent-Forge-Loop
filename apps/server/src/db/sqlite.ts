import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

// The only module that imports node:sqlite. Everything else goes through these helpers.
export type Db = DatabaseSync
type Param = string | number | null

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url))

export const nowIso = (): string => new Date().toISOString()
export const newId = (): string => randomUUID()

export const openDb = (path: string): Db => {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  return db
}

export const all = <T extends object>(db: Db, sql: string, params: Param[] = []): T[] =>
  db.prepare(sql).all(...params) as T[]

export const get = <T extends object>(db: Db, sql: string, params: Param[] = []): T | undefined =>
  db.prepare(sql).get(...params) as T | undefined

/** Returns the number of rows changed. */
export const run = (db: Db, sql: string, params: Param[] = []): number =>
  Number(db.prepare(sql).run(...params).changes)

export const transaction = <T>(db: Db, fn: () => T): T => {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export const migrate = (db: Db): void => {
  db.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  )
  const applied = new Set(
    all<{ name: string }>(db, 'SELECT name FROM _migrations').map((m) => m.name),
  )
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    if (applied.has(file)) continue
    transaction(db, () => {
      db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
      run(db, 'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)', [file, nowIso()])
    })
  }
}
