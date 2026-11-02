# CLAUDE.md

Rules for AI agents working in this repo. Read first: [ARCHITECTURE.md](ARCHITECTURE.md) (how the app works) and [docs/sprint-1-plan.md](docs/sprint-1-plan.md) (scope and definition of done).

## Commands

- Run commands from the repo root (the directory with the root `package.json`). Quote the path if it contains spaces: `cd "<repo>" && npm run check`.
- `npm run check` is the gate: Biome, typecheck and tests in every workspace. It must exit 0 before you report.
- `npm run fix` rewrites the whole repo. While others are editing, format only your own files.
- Never run `npm install`, `npm add` or `npm remove`. Dependencies are installed. If one is genuinely missing, say so in your report.
- Do not commit. Report the files you changed and how to verify them.

## Models

- Exact ids, no date suffix: `claude-sonnet-5-5` (default), `claude-opus-5-5`, `claude-haiku-5-5`.
- Keep all three selectable so the default can change. Source of truth: `packages/shared/src/schema/common.ts`.
- **Real API calls in tests and manual verification use `claude-haiku-5-5` only** (cost). The seeded agent is on Haiku for that reason; set any agent you run during a check to Haiku first. Automated tests never call the real API (inject a fake `Llm`).

## Code

- TypeScript strict. No `any`. Use `import type` for type-only imports. No `enum`.
- Validate every boundary (HTTP bodies, DB JSON columns, model output) with the zod schemas in `packages/shared`. Never redefine SDK types.
- Server routes parse input and call a `db/` module (or `engine/executor.ts` to start or cancel a run and to decide an approval). Business rules live in `db/`, except the approval and cancel guards, which live in `engine/executor.ts`. Error classes live in `apps/server/src/errors.ts`. HTTP status mapping lives in `app.ts`.
- Web: fetch happens only in `apps/web/src/api/*.ts` through `request()` from `client.ts`. Pages compose features; features own their hooks and components.
- Kebab-case file names, named exports, co-located `*.test.ts`. Files at most 300 lines (a guideline).
- Comments only where the why is not obvious.
- Formatting is Biome: single quotes, no semicolons, width 100.
- Before using zod 4, Hono 4, react-router 8, `@xyflow/react` 12, Tailwind 4, `radix-ui`, Vite 8 or Vitest 5, confirm the current API with the Context7 tools. Do not rely on memory.

## File ownership (builders)

- Edit only the files your task names.
- Do not edit existing schemas in `packages/shared`. Only the orchestrator changes them. Add a new file there only when your spec names it.
- To propose any other contract change, describe it in your report or PR with the reason and the exact change. Leave `packages/shared` as it is.

## Docs

- A structural change (new module, route, table, workspace or boot step) updates `ARCHITECTURE.md` in the same change.
