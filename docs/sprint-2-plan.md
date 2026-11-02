# Sprint 2 — backlog plan (proposal, not started)

Written 2026-10-14 after the sprint 1 cleanup pass. This is the "Not in this sprint" list from [sprint-1-plan.md](sprint-1-plan.md) section 1, sized and ordered so the owner can pick a sprint. Nothing here is built. Every item keeps the sprint 1 rules: local-first, `packages/shared` as the one contract, routes thin, business rules in `db/`, tests next to the code, `claude-haiku-5-5` for any real call in checks.

## 1. Ordering

Three groups, by what they need from outside the repo.

| Group | Items | Needs |
|---|---|---|
| **A. Local, no new service** | Version diff view · Parallel fan-out · Sub-agent ("consultant") node | Nothing. Each is a contract change plus engine or web work. Can start now. |
| **B. One external service each** | Slack trigger (then Teams, WhatsApp) · Browser automation (Playwright) · Connector marketplace | A Slack app and a workspace to test in; a Chromium build on the machine; a catalogue source. |
| **C. Platform changes** | Auth and multi-tenant · Cloud deploy · Screen/voice recording | A decision on hosting and identity first. These change the data model and the process model, so they go last and together. |

Recommended sprint 2: all of group A, plus the Slack trigger from group B. That is about two weeks with the same wave structure (orchestrator plus Haiku builders), and it leaves the app local-first. Group C is a sprint of its own once the hosting decision is made.

## 2. Items

Each item: what the user sees, the contract change, the files, the test, the size (S = a day, M = two or three days, L = a week or more).

### A1. Version diff view (S)

- **User sees**: on the agent page, "Compare versions": pick two versions, see the nodes and edges added, removed and changed, with the changed node's prompt or config shown side by side.
- **Contract**: none. The web computes the diff from two `AgentVersion` definitions it already fetches (`useAgent`).
- **Files**: `apps/web/src/features/versions/version-diff.ts` (pure: `diffDefinitions(a, b)` returning `{ added, removed, changed }` by node id, with `changed` listing the differing keys) and `version-diff-dialog.tsx`; a button in `agent-header.tsx`.
- **Test**: `version-diff.test.ts` on three fixtures: identical, one node changed, one node moved and one edge removed.
- **Risk**: none worth noting. Node ids are stable across versions because the draft keeps them.

### A2. Parallel fan-out in the graph (M)

- **User sees**: a **Parallel** node with two or more outgoing branches that run at the same time, and a **Join** node that waits for all of them and exposes their results as `prev` (an array in branch order).
- **Contract**: two node types in `packages/shared/src/schema/definition.ts` (`parallel`, `join`); `validateDefinition` rules: every branch out of a `parallel` reaches the same `join`, and nothing else reaches that `join`. `RunState` gains `branches: Record<string, unknown>` for the results collected so far.
- **Engine**: `executor.ts` `walk` is sequential. Add `walkBranch` for each outgoing edge of a `parallel` node, run them with `Promise.all`, and continue from the `join`. Cancel aborts every branch through the one `AbortController`. Events keep the `nodeId`, so the run console already shows each branch's steps; the timeline groups by node id and needs a "ran in parallel" marker.
- **Files**: `packages/shared` (orchestrator), `engine/executor.ts` (keep under 300 lines: put the branch walk in `engine/parallel.ts`), `engine/nodes/parallel.ts`, `nodes/join.ts`, `nodes/index.ts`, canvas: `node-types.ts`, palette, two forms.
- **Test**: two branches that each call the fake model, the join sees both results in order; cancel during one branch ends the run with one `run_end`.
- **Risk**: cost and concurrency. Each branch is a model call, so a parallel node multiplies spend. Keep the per-run `cost_cap` check meaningful by checking it inside each branch.

### A3. Sub-agent ("consultant") node (M)

- **User sees**: a **Consult** node that picks another agent and sends it an input (templated from `input`, `prev` and `vars`); the consulted agent's output becomes `prev`. The run detail shows the child run as a link.
- **Contract**: node type `consult` with `agentId`, `versionNumber?` and `inputTemplate`. `Run` gains `parentRunId: string | null`. `RunEvent` kind `child_run` with the child run id.
- **Engine**: `nodes/consult.ts` calls `startRun` with `triggerKind: 'api'` (the unused kind in the contract) and waits for the child's `run_end` on the bus. A depth limit of 3 and a cycle check (an agent cannot consult itself, directly or through a chain) in `validateDefinition` and at run time.
- **Files**: `packages/shared`, `db/runs.ts` (the column and the migration `002_parent_run.sql`), `engine/nodes/consult.ts`, canvas form, run detail link.
- **Test**: parent run reaches the child's output; a child that fails fails the parent with the child's error; the depth limit stops a chain.
- **Risk**: a child that waits on an approval blocks the parent until a person decides. Document it; do not auto-approve.

### B1. Slack trigger (M), then Teams and WhatsApp (M each)

- **User sees**: in the Triggers dialog, "Slack": connect a Slack app, pick a channel or "mentions", and each message starts a run with `{ text, user, channel, ts }` as the input. The Output node can post the reply back.
- **Contract**: `TriggerConfig` gains `{ kind: 'slack', channel, botToken (stored, never returned) }`. `triggers.config_json` holds it. A new route `POST /hooks/slack` for the Events API with the signing secret check.
- **Files**: `db/triggers.ts`, `routes/slack.ts` (new), `engine/tools/builtin.ts` (`slack_post` tool), the trigger dialog, `.env.example` (`SLACK_SIGNING_SECRET`).
- **Test**: the route rejects a bad signature, answers the URL verification challenge, and starts a run for a message event. No live Slack call in tests.
- **Risk**: secrets. Sprint 1 stores MCP `env` in plain text (ARCHITECTURE.md section 14). A bot token must not be returned by `GET /api/agents/:id/triggers`. Teams and WhatsApp follow the same shape with their own webhook formats; do Slack first and reuse the route pattern.

### B2. Browser automation with Playwright (L)

- **User sees**: a built-in tool `browser` (navigate, read the page text, click, type, screenshot) that an AI step can enable like `http_request`.
- **Contract**: none beyond the tool's input schema in `builtin.ts`. Each run gets its own browser context, closed at `run_end`.
- **Files**: `engine/tools/browser.ts` (new, the only Playwright importer), `builtin.ts` (register), the seed's `BUILTIN_TOOLS`.
- **Test**: against a static page served by the test (`http://localhost` from a Hono app in the test), not the internet.
- **Risk**: size and safety. Chromium is about 300 MB and is downloaded by `npx playwright install`, which the dev script cannot run for the user. The tool runs on the user's machine with the user's network. Allow only `http` and `https`, deny `localhost` by default, and cap a run at 50 actions. This is the item most likely to slip; put it last in group B.

### B3. Connector marketplace (L)

- **User sees**: on Connections, "Browse": a list of known MCP servers (name, description, what it needs), and "Add" fills the connection form.
- **Contract**: a static catalogue `packages/shared/src/catalogue.ts` (name, transport, command or URL, required env keys, docs link). No new route if the web reads the catalogue from the package.
- **Files**: the catalogue, `features/connections/catalogue-dialog.tsx`.
- **Test**: the catalogue parses with `ConnectionConfig`; one entry's "Add" produces a valid `CreateConnectionBody`.
- **Risk**: keeping the list current is a chore. Start with ten entries from the official MCP servers repository and no remote fetch.

### C1. Auth and multi-tenant (L)

- **User sees**: sign in; agents, runs, connections and memories belong to a workspace; invite by email.
- **Contract**: every table gains `workspace_id`; every route reads the workspace from the session; `packages/shared` gains `Workspace`, `User`, `Session`.
- **Design decision first**: local-first means a single user today, with no password. Options: (a) keep local-first and add workspaces only as a namespace, no login; (b) a hosted mode with email magic links (a mail sender needed) and the local mode unchanged. Option (b) is the real feature and depends on C2.
- **Risk**: this touches every `db/` module and every route. It is a wave of its own, with a migration that backfills a default workspace.

### C2. Cloud deploy (L)

- **User sees**: the app at a URL, with the database kept across deploys.
- **Decision first**: a single container (the API serves the built web app, section 8) on Fly.io or Railway with a volume for `data/`, or a managed Postgres. The `db/sqlite.ts` wrapper is the swap point the sprint 1 plan promised, but `node:sqlite` SQL (JSON functions, `SUM(bool)`) would need a review for Postgres.
- **Files**: `Dockerfile`, a deploy workflow, `README.md`. No app code change if SQLite on a volume is accepted.
- **Risk**: the scheduler and the MCP clients live in the API process (section 14). One instance only, no horizontal scaling, until there is a queue.

### C3. Screen and voice recording (L)

- **User sees**: record the screen or the microphone while describing an agent; the transcript or the frames feed the describe-to-draft prompt.
- **Decision first**: this is a browser feature (`MediaRecorder`) plus a transcription call. Voice is the cheap half: record, send audio to a transcription model, feed the text into the existing `DraftAgentBody`. Screen frames need a vision call per frame and a prompt that reads a workflow out of screenshots; that is a research task before it is a build task.
- **Recommendation**: voice only, as an S item, after group A; screen recording stays in the backlog.

## 3. What to decide before starting

1. Group A plus Slack, or a different cut.
2. For C1 and C2: local-first stays the default, and hosting is a separate mode (recommended), or the product moves to hosted-only.
3. Whether Playwright (B2) is wanted at all, given the download and the safety limits.
