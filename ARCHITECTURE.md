# Architecture

Version 6, at the end of sprint 1 (tag `v0.1.0`): waves 1 to 3 plus the day-10 clean-clone check. It describes the code as it is in the repo, checked against the source on 2026-10-14. `npm run check` is the gate; section 12 lists the test counts and the live checks. Parts that are not built yet are marked **(planned)** and follow [docs/sprint-1-plan.md](docs/sprint-1-plan.md). Any structural change (new module, route, table, workspace or boot step) updates this file in the same change.

## 1. Purpose and core concepts

Agent Forge Loop builds, runs, checks, evaluates and monitors AI agents. It is local-first. In the built setup, one Node process serves the API and the web app, backed by one SQLite file. There is no auth and no multi-tenancy.

- **Agent**: a name, a description and a **draft** `AgentDefinition`, the editable working copy.
- **Version**: an immutable snapshot of the draft, numbered 1, 2, 3 for each agent. Publishing creates one. No endpoint edits a version; deleting its agent deletes it.
- **Run**: one execution of one version, recorded as events. It starts at the trigger and walks the graph. **Checks** can fail a run or route it. **Approvals** pause it until someone approves or rejects. A run can be cancelled.
- **Evals** score a version against a dataset. Each case is a run with trigger `eval`, graded by its scorers. Eval cases are not production traffic: Insights and health leave them out. Triggers start runs on a schedule (croner) or by webhook; the header Run button is the manual trigger.

## 2. Stack

| Layer | Installed | Why |
|---|---|---|
| Runtime | Node 24 (`engines` >= 24); `node:sqlite` (built in, experimental) | No native build step; one file database. Only `db/sqlite.ts` imports it, so changing the driver is a one-file change. |
| API | Hono 4.13, `@hono/node-server` 2.1 | Small and typed. `app.request` runs route tests in memory. `streamSSE` serves run events. |
| Contract | zod 4.6 in `packages/shared` | One source for types, validation and JSON Schema. |
| Web | React 19.3, Vite 8.3, react-router 8.4, TanStack Query 5.104, Tailwind 4.3, radix-ui 1.8, lucide-react 1.56 | In use. |
| Canvas and code editing | `@xyflow/react` 12.12, `@uiw/react-codemirror` 4.25, `@codemirror/lang-*` | In use: the Build canvas and the node forms. |
| Charts | recharts 3.10 | Insights: the spend chart (wave 2). The sparklines and the health ring are hand-drawn SVG. |
| LLM, scheduler, MCP | `@anthropic-ai/sdk` 0.133 (model calls, the draft endpoint, the LLM judge); `croner` 10.0.1 (scheduler, schedule triggers); `@modelcontextprotocol/sdk` 1.32 (the MCP client: stdio and streamable HTTP) | The scheduler runs in the API process. |
| Quality | Biome 2.5, TypeScript 7.0, Vitest 5.0 | One gate: `npm run check`. |

Several packages are declared `latest` in `package.json` (`lucide-react`, `radix-ui`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `@codemirror/lang-*`, `tsx`). `package-lock.json` pins the versions above.

## 3. Repository layout

```
.env.example                 template for .env: ANTHROPIC_API_KEY, PORT, DB_PATH
biome.json                   lint and format rules
tsconfig.base.json           strict TypeScript settings; each workspace extends it
package.json  package-lock.json  npm workspaces and root scripts
scripts/dev.mjs              starts the API and the web dev server together
README.md  ARCHITECTURE.md  CLAUDE.md  LICENSE
docs/
  sprint-1-plan.md           approved plan, definition of done, wave schedule
packages/shared/             @agentforgeloop/shared: the zod contract (section 5)
  package.json  tsconfig.json
  src/index.ts  src/api.ts
  src/api/runs.ts            run and approval bodies, responses, SSE names, run paths
  src/api/evals.ts  triggers.ts  draft.ts  insights.ts   wave-2 contracts (bodies, views, path helpers); used by the app and by the web `api/*.ts` files
  src/api/connections.ts  memory.ts   wave-3 contracts (bodies, views, path helpers)
  src/schema/common.ts  agent.ts  run.ts  eval.ts  connection.ts  memory.ts  agent.test.ts
apps/server/                 @agentforgeloop/server: Hono API and engine (section 8)
  package.json  tsconfig.json
  src/index.ts               boot: .env, database, migrations, seed, recovery (runs and eval runs), engine deps, scheduler, listen
  src/app.ts                 routes, /api/health, error mapping
  src/scheduler.ts (+ test)  startScheduler(deps) -> { reload, stop }: one croner job per enabled schedule trigger, plus a once-a-minute job that times out approvals whose wait has passed
  src/errors.ts              NotFoundError, ConflictError, InvalidDefinitionError, ValidationError, DraftError
  src/seed.ts (+ test)       the example agent
  src/routes/agents.ts (+ test)        agents CRUD and versions
  src/routes/runs.ts (+ test)          list, start, detail, cancel, events
  src/routes/run-stream.ts             SSE: replay, then live events
  src/routes/approvals.ts (+ test)     pending queue, approve, reject
  src/routes/connections.ts (+ test)  connections: list, add (probed first), edit, refresh, delete
  src/routes/memories.ts (+ test)     an agent's memory facts: list, add, delete, clear
  src/routes/evals.ts (+ test)         datasets, cases, eval runs
  src/routes/triggers.ts (+ test)      trigger list, add, edit, delete; each write calls scheduler.reload()
  src/routes/hooks.ts (+ test)         POST /hooks/:agentId/:secret: a webhook start, 202 with runId
  src/routes/draft.ts (+ test)         POST /api/draft (describe to draft), GET /api/templates, POST /api/templates/:id/agents
  src/routes/insights.ts (+ test)      GET /api/insights, GET /api/agents/:id/health
  src/routes/read-json.ts              readJson(c): the request body as JSON, {} when empty
  src/db/triggers.ts (+ test)          trigger rules: cron and zone checks, webhook secrets, resolveWebhook, scheduleSkipReason
  src/db/insights.ts (+ test)          insights aggregates: totals, previous window and series, per agent, per model; zone-aware days
  src/draft.ts (+ test)                describe to draft: the model call, the reply parser, one repair round, autoLayout
  src/templates.ts (+ test)            the three built-in templates
  src/engine/health.ts (+ test)        computeHealth (adherence, autonomy, efficiency) and the shared SQL conditions
  src/evals/                 runner.ts, scorers.ts (+ tests): eval runs and the scorers
  src/db/agents.ts           agent and version rules, row mapping
  src/db/runs.ts             run and event rules, listing, detail, boot recovery
  src/db/approvals.ts        approval rules, the pending queue, expiry and timeout lookup
  src/db/connections.ts (+ test)  connection rules: MCP rows, config, enabled tools, the built-in row
  src/db/memories.ts (+ test)     memory rules: newest first, add, delete, search, clear
  src/db/evals.ts            dataset, case and eval run rules; failInterruptedEvalRuns
  src/db/run-fixtures.ts     test helper: publishes a version and inserts runs
  src/db/sqlite.ts (+ test)  the only node:sqlite importer; helpers and migrate()
  src/db/migrations/001_init.sql
  src/engine/executor.ts (+ test)      walks a version's graph; start, resume, cancel, recover
  src/engine/approvals.ts              the decisions on a waiting run: decide, reject, time out
  src/engine/nodes/          index.ts (dispatch), ai (+ test), code, check, approval (+ test), branch, output
  src/engine/checks.ts (+ test)        the five check kinds
  src/engine/json-schema.ts (+ test)   the JSON Schema subset used by json_schema checks
  src/engine/llm.ts (+ test)           Anthropic client, price table, cost, judge
  src/engine/sandbox.ts (+ test)       node:vm for Code and Branch steps
  src/engine/template.ts (+ test)      {{ path }} rendering
  src/engine/tools/          registry.ts, mcp.ts, builtin.ts (all with tests); types.ts has no test; fake-mcp.ts is a test helper; mcp-run.test.ts runs MCP tools inside a run
  src/engine/bus.ts          in-memory fan-out of run events to SSE
  src/engine/types.ts        RunState, NodeOutcome, EngineDeps
  src/engine/testing.ts      test-only helpers (fake Llm, messages, waitFor)
apps/web/                    @agentforgeloop/web: Vite and React (section 9)
  package.json  tsconfig.json  index.html  vite.config.ts  playwright.config.ts
  e2e/smoke.spec.ts          Playwright smoke test (section 12); not part of npm run check
  src/main.tsx  app.tsx  styles.css
  src/api/client.ts          request() (the only fetch call; other api/*.ts files import it); React Query hooks
  src/api/sse.ts             EventSource wrapper for a run's stream
  src/api/draft.ts  evals.ts  insights.ts  triggers.ts   wave-2 hooks; each imports request() from client.ts
  src/api/connections.ts  memory.ts   wave-3 hooks
  src/components/layout/     AppShell, PageHeader
  src/components/ui/         Badge Button Card Dialog EmptyState Field Input Select Spinner Switch Tabs Textarea Toast Tooltip
  src/features/agents/       AgentCard AgentHeader AgentMenu EditableName NewAgentDialog StatusBadge, describe-agent-form, blank-agent-form, template-agent-list, draft-preview (wave 2: New agent)
  src/features/evals/        the Evals tab: evals-tab, datasets-panel, cases-panel, case-dialog, scorer-editor, scorer-builder (+ test), run-evals-form, eval-runs-panel, eval-run-list, eval-results, results-table, compare-view, summary-tiles, eval-format, eval-status-badge, pass-mark, stat
  src/features/insights/     insights-tab, kpi-tiles, spend-chart, agent-table, model-table, attention-list, health-ring, health-scores, sparkline, window-select, when-loaded, insight-format
  src/features/triggers/     trigger-chip, trigger-dialog, trigger-list, schedule-form, schedule (+ test), webhook-details
  src/features/connections/  connections-list, connection-card, add-server-dialog, server-config (+ test)
  src/features/memory/       memory-tab, memory-list, add-fact-form
  src/features/canvas/       the Build tab and editor: build-tab, palette, canvas, inspector, node-inspector,
                             agent-settings, use-definition, use-debounced-save, definition-graph (+ test),
                             problems-banner, node-info
                             nodes/ (a card per kind, node-card, node-types, node-summary)
                             node-forms/ (a form per kind except the trigger, check-fields,
                             CodeMirror code-editor, tool-picker (the AI step's tools); the trigger shows a fixed line in node-inspector.tsx)
  src/features/runs/         active-run (store), run-console, run-feed, run-event, run-timeline, run-detail-view,
                             approval-actions, pending-approvals, runs-table, runs-tab, run-status-badge,
                             json-block, run-format (+ test)
  src/pages/                 agents agent run runs connections insights
  src/lib/                   cn, format (money, compactNumber, timeAgo) and its test
```

Generated or ignored (see `.gitignore`): `node_modules/`, `apps/web/dist/` (from `npm run build`), `data/` (created at first start), `.env`, `*.log` files and `.playwright-mcp/` (browser-test logs, not app code). Playwright writes its output to `node_modules/.cache/playwright/`.

Waves 1 to 3 are built and listed above. The seed also inserts the `builtin` connection row. Contract for memory and connections: `packages/shared/src/schema/memory.ts`, `api/connections.ts`, `api/memory.ts`.

## 4. Request flow

### Request path

```
Browser  fetch("/api/...")          apps/web/src/api/client.ts (the only fetch call)
  |
  |  dev:   Vite :5173 proxies /api and /hooks to :8787
  |  built: the API on :8787 serves apps/web/dist, so app and /api share one origin
  v
apps/server/src/app.ts              mounts routes; /api/health; maps errors to HTTP
  |
  v
routes/*.ts                         parses the body with a shared zod schema; calls one db/ or engine/ function
  |
  v
db/agents.ts, db/runs.ts,           rules (definition check, versions, run state, approvals); rows to shapes
db/approvals.ts
  |
  |  routes/runs.ts calls engine/executor.ts (start, walk, cancel); routes/approvals.ts calls engine/approvals.ts (decide); both use db/ too
  |
  v
db/sqlite.ts                        the only node:sqlite importer: all, get, run, transaction, migrate
  |
  v
data/agentforgeloop.db                WAL mode, foreign keys on
```

`/hooks` is proxied for the webhook endpoint. `POST /hooks/:agentId/:secret` starts a run with trigger `webhook`, answers 202 with `{ runId }`, and answers 404 for an unknown or disabled secret and 409 (`agent is paused`, `agent has no version`) for an agent that cannot run.

### Engine flow

Code paths: `routes/runs.ts` (start, cancel), `engine/executor.ts` (the walk), `engine/approvals.ts` (the decisions), `engine/nodes/` (one handler per kind), `db/runs.ts` (rows and events), `routes/approvals.ts` and `db/approvals.ts` (the queue and decisions), `routes/run-stream.ts` (SSE).

```
POST /api/agents/:id/runs    StartRunBody; startRun resolves the version; insert run (queued); 201
setImmediate                 executeRun: queued -> running, run_start, walk from the trigger
walk, per node               node_start -> handler (engine/nodes/) -> node_end (ok), or wait, or fail
                             each event: insert run_events (seq), publish on the bus
                             each completed node: save runs.state_json, tokens and cost
output node                  run_end succeeded (output = the node's value)
approval node                waiting_approval; approve resumes the walk, reject fails the run
cancel                       abort the walk, cancelled, expire pending approvals, run_end cancelled
boot                         queued and running runs fail with "interrupted by restart"
SSE                          replay stored events, follow the bus, done after run_end
```

**Start.** `POST /api/agents/:id/runs` parses `StartRunBody`. `startRun` resolves the version (the current one, or `versionNumber`), inserts a `runs` row with status `queued`, the input and the initial state, and returns it with 201. The walk starts on `setImmediate`, after the response.

**Walk.** `executeRun` loads the run with its version's definition and saved state. A run that is no longer `queued` stops here, so a run cancelled first never starts. Otherwise it sets `running` and `started_at`, appends `run_start`, and `walk` runs from the trigger. For each node, `walk` appends `node_start` (with the node type), runs the handler, then acts on the outcome:

- `next`: appends `node_end` (ok, with its duration), takes `prev` if the handler returned one, and saves the run row (state, tokens, cost). An output node ends the run as `succeeded`. Any other node follows the edge with the outcome's label, else the unlabelled edge. A node with no edge to follow fails the run with `no edge leaves node "<id>"`.
- `wait` (approval): saves the run as `waiting_approval` with its state, and stops. The handler has already created the approval row and appended `approval_requested`.
- `fail` (a failed check, a Code error, an AI step that fails, a thrown error): appends `error` and `node_end` (failed), then ends the run as `failed` with that message.

**End.** `finish` saves the run's status, cost, tokens and `finished_at` (for `succeeded`, the output is the output node's value). Only then does it append `run_end` with status, cost and duration, so a stream that sees `run_end` reads the final run.

**Where state lives.** Database rows are the source of truth:

- `runs`: status, tokens, cost, error, timings, `input_json`, `output_json`, and `state_json` (the `RunState`: input, vars, prev, node id, cost, tokens, tools used). `state_json` is saved after each completed node and at each approval wait.
- `run_events`: one row per event, numbered by `seq` within its run. The row is written before the event is published.
- `approvals`: one row per approval request. A decision is written once.
- `agent_versions.definition_json`: the definition a run executes. A run never reads the draft.

In memory only, and lost on restart: `active` in `executor.ts` (one `AbortController` per run that is walking in this process) and the `RunBus` in `bus.ts` (an `EventEmitter` keyed by run id, used by SSE).

**Events.** The engine emits `run_start`, `node_start`, `node_end`, `model_call`, `tool_call`, `tool_result`, `check_result`, `approval_requested`, `approval_resolved`, `error` and `run_end`. `log` is written when an approval passes by itself in an eval run (`engine/nodes/approval.ts`), and when an AI step loads memory facts (`Loaded N memories`). The `skipped` node status is in the contract and never written. Payload shapes are in `packages/shared/src/schema/run.ts`.

**Approve.** `POST .../approve` calls `decideApproval`. The approval must belong to the run, be pending, and the run must be `waiting_approval`. It records the decision, appends `approval_resolved`, and starts `resumeRun` without waiting for it. `resumeRun` sets `running`, appends `node_end` (ok) for the approval node with the time since the request, and walks on from the approval node's unlabelled edge. The response is the run detail, which already shows `running`.

**Reject.** The same checks. The approval becomes `rejected`, `approval_resolved` is appended, and `rejectRun` appends `error` (`Rejected by reviewer`, plus `: <note>` when a note was given) and `node_end` (failed). The run ends as `failed`.

**Cancel.** `POST /api/runs/:id/cancel` on a run that is `queued`, `running` or `waiting_approval` aborts the walk if one is live, sets `cancelled` and `finished_at`, expires the run's pending approvals, and appends `run_end` (cancelled). Every event emit checks the abort signal and throws, so nothing is stored after `run_end`. A run cancelled while it waits gets no `node_end` for its approval node, so that timeline group has no duration (section 14).

**Restart.** At boot, `recoverInterruptedRuns` marks `queued` and `running` runs `failed` with the error `interrupted by restart`, and appends a `run_end` (failed) to each. At boot, `failInterruptedEvalRuns` does the same for eval runs (`queued` or `running` become `failed`). `waiting_approval` runs are left alone: their state is saved, so an approval made after the restart resumes them.

**Live events (SSE).** `GET /api/runs/:id/events` (`routes/run-stream.ts`) subscribes to the bus first, then replays the stored events in `seq` order, then forwards live events. A live event whose `seq` was already sent is dropped. A `: keep-alive` comment goes out after 15 s without events. After `run_end` the stream sends `event: done` with the final run, and ends. The stream lives in this process: a restart ends it, and a reconnect replays from the database.

**Concurrency.** Runs execute in the same process, and nothing limits how many run at once. Database calls are synchronous (`node:sqlite`), and the event sequence is assigned on one thread, so each `seq` is unique within its run.

### Tool and memory flow

Code paths: `nodes/ai.ts` (the model loop, the facts block), `engine/tools/registry.ts` (names, resolve, call, listings), `engine/tools/mcp.ts` (the MCP client), `engine/tools/builtin.ts` (built-in tools), `db/connections.ts`, `db/memories.ts`.

```
AI step, memory on          listMemories: the 20 newest facts -> one cached system block, after the principles
                            emit log "Loaded N memories" (only when there are facts)
AI step, tools              the node's tools, or the agent's tools when the node lists none
                            registry.resolve: built-in tools and the enabled tools of each MCP connection
                            name the model sees: <connectionId>__<tool>; strict only for built-in tools
                            a ref that is not resolved -> the step fails with Unknown tool "<connection>/<tool>"
model answers tool_use      each call: tool_call, then registry.call(ref, input, signal, { db, agentId, runId })
                            built-in: its run(); MCP: client.callTool (30 s limit, the run's abort signal)
                            a thrown error or a failed call -> tool_result with isError; the model sees it and may go on
                            tool_result { output, isError, durationMs }; the results go back in one user message
```

Memory tools are built-in. `memory_save` stores a fact for the run's agent, with the run as its source (`runs` row). `memory_search` returns up to 5 facts whose text contains the query, newest first. Both get their agent and run from `ToolContext`, so a tool never writes to another agent. The facts block reaches the model only when the agent's memory switch is on, but the tools work either way.

Which tools resolve: built-in tools always resolve, whatever `enabledTools` says. An MCP tool resolves only when its connection is listed and the tool is in its `enabledTools`. The registry reads connections on every call, so an enabled-tools change applies at once. An MCP server that is not listed yet (a new server, or boot before its listing ends) gives `Unknown tool` for a run that starts now; a retry works once the listing has finished.

### Trigger flow

Code paths: `routes/triggers.ts` and `db/triggers.ts` (the rules), `scheduler.ts` (croner jobs), `routes/hooks.ts` (webhooks), `engine/executor.ts` (`startRun`), `engine/approvals.ts` (`timeOutApproval`).

```
POST /api/agents/:id/triggers    CreateTriggerBody; a schedule's cron and zone are checked; webhook gets a secret; 201 TriggerView
                                 then scheduler.reload(): the croner jobs are rebuilt from the triggers table
croner tick (schedule)           scheduleSkipReason: paused, no version or deleted -> logged, no run
                                 else startRun({ triggerKind: 'schedule', input: { scheduledAt } })
POST /hooks/:agentId/:secret     resolveWebhook: unknown or disabled secret -> 404; agent cannot run -> 409
                                 else startRun({ triggerKind: 'webhook', input: body, or body.input when the key is there }); 202 { runId }
POST /api/agents/:id/runs        the header Run button; triggerKind 'manual'
every minute (scheduler)         expireTimedOut: pending approvals past timeoutMinutes -> timeOutApproval (section 8)
```

All four start the same walk as a manual run (`startRun`, then `executeRun`). A scheduled or webhook run is recorded in `runs.trigger_kind` like any other run and shows in the run list and Insights. Unlike a manual run, the caller gets no 201 with the run; a schedule firing has no response at all.

### Eval flow

Code paths: `routes/evals.ts`, `evals/runner.ts` (the walk over cases), `evals/scorers.ts` (one scorer), `db/evals.ts` (rows and results), and `engine/nodes/approval.ts` (the eval exception).

```
POST /api/agents/:id/evals/runs  { datasetId, versionNumber? }
  startEvalRun                   the dataset must be this agent's (404); it needs cases (409); the version is resolved
                                 insert eval_runs as queued; 202 EvalRun; the rest runs in setImmediate
  execute                        status running; each case goes through startRun with triggerKind 'eval', pinned to the eval run's version
                                 at most 3 cases at once; each run is polled every 300 ms
                                 a run still unfinished after 5 minutes is cancelled; its case fails
                                 scorers run on the run's output, events and cost; a run that did not succeed adds a failed 'run' score
                                 insert eval_results; summary { total, passed, passRate, meanCostUsd, p50LatencyMs }; status succeeded
                                 any exception: status failed
```

A case passes when its run succeeded and every scorer passed. Eval runs are real runs, so they cost real model calls, but Insights and health leave them out (`NON_EVAL_SQL`). In an eval run an approval node passes by itself, so the case does not wait for a person. On boot, `failInterruptedEvalRuns` marks eval runs left `queued` or `running` as `failed`.

### Draft flow

Code paths: `routes/draft.ts`, `draft.ts` (the model call, the reply parser, the repair round, `autoLayout`), `templates.ts`.

```
POST /api/draft                  DraftAgentBody { description (10+ characters), model }
  attempt 1                      one model call (structured output with DRAFT_SCHEMA; a 400 falls back to the propose_agent tool)
                                 reply -> JSON object -> null values dropped -> AgentDefinition.safeParse -> validateDefinition
  repair (only if problems)      the problems go back to the model in the same conversation, once
  no definition                  DraftError -> 502 with the reason
  success                        every AI step gets the dialog's model; autoLayout places the nodes; 200 { definition, problems }
POST /api/agents (the web app)   the drafted definition is saved as a draft agent: no version yet. The dialog allows this only when problems is empty.
GET /api/templates               three built-in TemplateSummary entries
POST /api/templates/:id/agents   { name? }: creates the agent from the template and publishes version 1 (201)
```

`POST /api/draft` never saves anything. A draft with problems still returns 200, with the problems listed, so the dialog can show them.

## 5. The contract: `packages/shared`

- Imported as `@agentforgeloop/shared` (entry `src/index.ts`). It ships TypeScript source; there is no build step.
- The server and the web app validate with these schemas. Nothing else redefines these shapes.
- **Ownership rule:** only the orchestrator changes existing schemas. A wave may add new files here when its spec names them. A wish to change an existing schema is proposed with its reason and exact change. The plan freezes the contract after day 1.

Files:

- `index.ts`: re-exports everything below.
- `api.ts`: agent request bodies (`CreateAgentBody`, `UpdateAgentBody`, `PublishVersionBody`), responses (`AgentWithVersions`, `ApiError`, `Health`) and `routes`, the agent path helpers.
- `api/evals.ts`, `api/triggers.ts`, `api/draft.ts`, `api/insights.ts`: the wave-2 contracts. Bodies (`CreateDatasetBody`, `CreateCaseBody`, `UpdateCaseBody`, `StartEvalRunBody`, `CreateTriggerBody`, `UpdateTriggerBody`, `DraftAgentBody`, `CreateFromTemplateBody`, `InsightsQuery`), views (`EvalCaseResult`, `EvalRunDetail`, `TriggerView`, `WebhookAccepted`, `DraftAgentResponse`, `TemplateSummary`, `HealthScores`, `InsightsTotals`, `InsightsSeriesPoint`, `InsightsAgentRow`, `InsightsModelRow`, `InsightsOverview`) and the path helpers `evalRoutes`, `triggerRoutes`, `draftRoutes`, `insightsRoutes`. The app and the web client use them.
- `api/connections.ts`, `api/memory.ts`: the wave-3 contracts. Bodies (`CreateConnectionBody`, `UpdateConnectionBody`, `CreateMemoryBody`), the view `ConnectionView`, and the path helpers `connectionRoutes` and `memoryRoutes`.
- `api/runs.ts`: run and approval request bodies (`StartRunBody`, `RunListQuery`, `ApprovalDecisionBody`), responses (`RunSummary`, `RunDetail`, `PendingApproval`), the SSE event names (`run_event`, `done`) and `runRoutes`, the run path helpers.
- `schema/common.ts`: `MODEL_IDS` (`claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-5-5`), `ModelId`, `DEFAULT_MODEL` (`claude-sonnet-5-5`), `MODEL_LABELS`, `Effort` (low, medium, high; default medium), `Id`, `IsoDate`, `EdgeLabel`.
- `schema/agent.ts`: node and check schemas, `AgentDefinition`, `Agent`, `AgentVersion`, `validateDefinition`, `defaultDefinition`.
- `schema/run.ts`: `Run`, `RunEvent` with a payload shape for each kind except `run_start` and `node_start`, `Approval`. The schedule and webhook trigger shapes are here too, used by `db/triggers.ts`.
- `schema/eval.ts`: the eval shapes, used by the evals code. `schema/connection.ts`: the connection and MCP config shapes, used by the server and the web app. `schema/memory.ts`: the `Memory` shape.
- `schema/agent.test.ts`: tests for defaults and graph validation.

Key shapes (`schema/agent.ts`):

```ts
AgentDefinition {
  name, description
  model: ModelId                  // default claude-sonnet-5-5
  effort: low | medium | high     // default medium
  principles: string              // markdown
  memory: { enabled }
  tools: ToolRef[]                // ToolRef = { connectionId, tool }
  nodes: Node[]
  edges: Edge[]
}

Node =
  | trigger
  | ai        { prompt, model?, effort?, tools, maxTurns }     // maxTurns 1-50, default 8
  | code      { source }                                       // JS run in node:vm
  | check     { check: CheckConfig, onFail: stop | route }     // onFail default stop
  | approval  { message, timeoutMinutes?, onTimeout: fail | approve }  // default fail; enforced by the per-minute expiry (section 8)
  | branch    { expression }                                   // JS boolean
  | output    { template }                                     // default ''

CheckConfig  = regex | json_schema | llm_judge | cost_cap | tool_allowlist   // discriminated by kind
Edge         = { id, from, to, label?: pass | fail | true | false }
Agent        = { id, name, description, status: draft | active | paused,
                 currentVersion: number | null, draft, createdAt, updatedAt }
AgentVersion = { id, agentId, number, definition, note, createdAt }
Run          = { id, agentId, versionId, versionNumber, triggerKind, status, input, output,
                 tokensIn, tokensOut, costUsd, error, startedAt, finishedAt, createdAt }
                 // status: queued | running | waiting_approval | succeeded | failed | cancelled
RunEvent     = { id, runId, seq, ts, kind, nodeId, payload }
                 // kind: run_start, node_start, node_end, model_call, tool_call, tool_result,
                 //       check_result, approval_requested, approval_resolved, log, error, run_end
Approval     = { id, runId, nodeId, status, note, requestedAt, resolvedAt }
                 // status: pending | approved | rejected | expired
```

`validateDefinition(def)` returns the graph problems that zod cannot express. An empty list means valid.

- Exactly one trigger, at least one output, and unique node ids.
- Every edge points at existing nodes.
- Every node after the trigger has an incoming edge (`Node "<id>" has no incoming edge`).
- An output node has no outgoing edge; every other node has one.
- A branch has a `true` edge and a `false` edge.
- A check with `onFail: 'route'` has a `fail` edge.

The client's `getProblems` in `definition-graph.ts` returns this same list (plus the zod schema errors), so the editor and the server report the same rule. Not checked yet: full reachability from the trigger, cycles, and edge labels on nodes other than branch and check.

`defaultDefinition(name)` builds trigger, then an AI step, then output. The API uses it when an agent is created without a draft.

## 6. Data model

The database file is `DB_PATH` (default `data/agentforgeloop.db`, relative to the repo root). Migrations are in `apps/server/src/db/migrations/`. They run in name order, each in a transaction, and each applied file is recorded by name in `_migrations`. An applied file is skipped even if its text changes, so **schema changes go in a new numbered file**. `migrate` is idempotent (`db/sqlite.test.ts`). Wave 1 added no migration.

Migration `001_init.sql` creates 12 tables, with unique indexes on `agent_versions (agent_id, number)` and `run_events (run_id, seq)`. Columns are listed by name only; see the migration for types. Waves 1 to 3 added no migration: the triggers, eval, connection and memory tables were already in 001.

| Table | Columns (besides `id`) | JSON columns | Used today |
|---|---|---|---|
| `agents` | name, description, status (draft, active, paused), current_version (a number, or null), created_at, updated_at | draft_json (AgentDefinition) | yes |
| `agent_versions` | agent_id, number (unique per agent), note, created_at | definition_json (AgentDefinition) | yes |
| `triggers` | agent_id, kind, enabled, created_at | config_json | yes (schedule and webhook) |
| `runs` | agent_id, version_id, version_number, trigger_kind, status, tokens_in, tokens_out, cost_usd, error, started_at, finished_at, created_at | input_json, output_json, state_json | yes (manual, schedule, webhook and eval) |
| `run_events` | run_id, seq (unique per run), ts, kind, node_id | payload_json | yes |
| `approvals` | run_id, node_id, status (pending, approved, rejected, expired), note, requested_at, resolved_at | none | yes |
| `memories` | agent_id, content, source_run_id (nullable), created_at | none | yes: `db/memories.ts`, `routes/memories.ts`, the AI step's facts block and the memory tools |
| `connections` | kind (builtin or mcp), name, created_at | config_json (nullable), enabled_tools_json | yes: `db/connections.ts`, `routes/connections.ts`. The seed inserts the `builtin` row; MCP rows hold an `McpConfig` in config_json |
| `eval_datasets` | agent_id, name, created_at | none | yes (`db/evals.ts`) |
| `eval_cases` | dataset_id, name | input_json, scorers_json, tags_json | yes (`db/evals.ts`) |
| `eval_runs` | agent_id, dataset_id, version_id, version_number, status, created_at, finished_at | summary_json | yes (`db/evals.ts`) |
| `eval_results` | eval_run_id, case_id, run_id, pass, cost_usd, latency_ms | scores_json | yes (`db/evals.ts`) |

Relations (every foreign key cascades on delete):

- `agents` own `agent_versions`, `triggers`, `runs`, `memories`, `eval_datasets` and `eval_runs`.
- `agent_versions` are referenced by `runs` and `eval_runs` (`version_id`).
- `runs` own `run_events` and `approvals`, and are referenced by `memories` (`source_run_id`) and `eval_results`.
- `eval_datasets` own `eval_cases` and `eval_runs`. `eval_runs` own `eval_results`, which also reference `eval_cases`.
- `connections` has no foreign keys. `enabled_tools_json` holds tool names. A name the server no longer lists does nothing, and an AI step that uses it fails with `Unknown tool`.
- `memories.source_run_id` is null for a fact a person adds, and set for a fact `memory_save` stored. Deleting that run deletes the fact (`ON DELETE CASCADE`).
- `connections.config_json` holds the whole MCP config, including every `env` value, as plain text. Those values are also returned by `GET /api/connections` (section 14).

Notes:

- `agents.current_version` holds a version number, not an id.
- `agents.name` and `agents.description` are also stored in `draft_json`. `db/agents.ts` writes both from the same values.
- The JSON columns in use are parsed when read. `draft_json` and `definition_json` go through `Agent.parse` and `AgentVersion.parse`. `state_json` goes through `RunStateSchema` (`engine/types.ts`). `input_json`, `output_json` and `payload_json` are parsed as JSON and then validated by `Run` and `RunEvent`. Other JSON columns get their shared schema when their module is built.
- `runs.status` moves through queued, running, waiting_approval (and back to running after a decision), then succeeded, failed or cancelled.
- `runs.trigger_kind` is `manual`, `schedule`, `webhook` or `eval`. The contract's `api` kind is never written.
- `triggers.config_json` holds `{ kind: 'schedule', cron, timezone }` or `{ kind: 'webhook', secret }`. The secret is stored in the database and is returned in the trigger's `webhookUrl`.
- `eval_results.scores_json` holds one `ScoreResult` per scorer, plus a `run` score when the run did not succeed.
- A run cancelled while it waits marks its pending approval `expired`, so no queue shows it. Boot fails queued and running runs and leaves waiting_approval runs alone.
- `triggers.kind` has no CHECK constraint. The contract allows `schedule` and `webhook`.

## 7. API (current)

Base path `/api`. Bodies and responses are JSON. Request bodies are validated with the shared schemas. Agent, run and approval rows are parsed on the way out.

Agents:

| Method and path | Request | Response |
|---|---|---|
| `GET /api/health` | none | 200 `{ ok: true, version }` |
| `GET /api/agents` | none | 200 `Agent[]`, newest first |
| `POST /api/agents` | `{ name, description?, draft? }` | 201 `Agent`. Without `draft`, the agent gets the default draft. |
| `GET /api/agents/:id` | none | 200 `AgentWithVersions`: the agent plus `versions`, by number |
| `PATCH /api/agents/:id` | any of `{ name, description, status, draft }` | 200 `Agent` |
| `DELETE /api/agents/:id` | none | 204, no body |
| `GET /api/agents/:id/versions` | none | 200 `AgentVersion[]`, by number |
| `POST /api/agents/:id/versions` | `{ note? }`, or no body | 201 `AgentVersion` |

Runs and approvals:

| Method and path | Request | Response |
|---|---|---|
| `GET /api/runs` | query: `agentId?`, `status?`, `limit?` (1 to 200, default 50) | 200 `RunSummary[]`, newest first, each with `agentName` |
| `GET /api/agents/:id/runs` | none | 200 `RunSummary[]` for that agent, newest first, up to 50 |
| `POST /api/agents/:id/runs` | `{ input, versionNumber? }`. The `input` key must be present; send `null` for no input. | 201 `Run`, status `queued`. The walk starts after the response. Uses the agent's current version unless `versionNumber` is given. Trigger kind `manual`. |
| `GET /api/runs/:id` | none | 200 `RunDetail`: the run, its agent name, its events (by seq) and its approvals |
| `POST /api/runs/:id/cancel` | none | 200 `Run`. A run that already ended is returned unchanged. |
| `GET /api/runs/:id/events` | none | SSE (below). 404 before the stream starts if the run is unknown. |
| `GET /api/approvals` | none | 200 `PendingApproval[]`, oldest first, across agents |
| `POST /api/runs/:runId/approvals/:approvalId/approve` | `{ note? }` (an empty body counts as `{}`) | 200 `RunDetail`, status `running`. The run continues in the background. |
| `POST /api/runs/:runId/approvals/:approvalId/reject` | `{ note? }` | 200 `RunDetail`, status `failed`, error `Rejected by reviewer` (plus `: note` when given) |

Connections and memory:

| Method and path | Request | Response |
|---|---|---|
| `GET /api/connections` | none | 200 `ConnectionView[]`: the built-in row first, then the MCP rows oldest first. Each has its `tools` from the last listing and a `status` (`builtin`, `ok` or `error`, with `error` text). |
| `POST /api/connections` | `{ name, config }` (`config` is an `McpConfig`) | 201 `ConnectionView`. The server is listed first. If it cannot be listed, 502 `{ error }` and nothing is saved. |
| `PATCH /api/connections/:id` | any of `{ name, enabledTools, config }` | 200 `ConnectionView`. With `enabledTools`, each name must be a tool the server lists (400 otherwise). A `config` alone is saved and listed again: the response is still 200, with `status: 'error'` when the server fails. The built-in row takes no `config` (409). |
| `POST /api/connections/:id/refresh` | none | 200 `ConnectionView`, after listing the server again |
| `DELETE /api/connections/:id` | none | 204. An MCP connection only; the built-in row gives 409. |
| `GET /api/agents/:id/memories` | none | 200 `Memory[]`, newest first. 404 for an unknown agent. |
| `POST /api/agents/:id/memories` | `{ content }` (at least one character) | 201 `Memory` |
| `DELETE /api/agents/:id/memories` | none | 204. Deletes all of the agent's facts. 404 for an unknown agent. |
| `DELETE /api/memories/:id` | none | 204. 404 for an unknown id. |

Connection and memory shapes:

```
ConnectionView = id, kind (builtin | mcp), name, config (McpConfig, or null for builtin),
                 enabledTools (tool names), createdAt,
                 tools (ToolDescriptor[]: name, description, inputSchema), status, error
McpConfig      = transport (http | stdio), url?, command?, args (string[]), env (string -> string)
Memory         = id, agentId, content, sourceRunId (or null), createdAt
```

Connection and memory errors, all shaped `{ error }` (validation errors use the usual `{ error: 'validation', details }`):

| Status | `error` | When |
|---|---|---|
| 400 | `validation` | a body fails the shared schema (empty name, empty content, a transport other than http or stdio) |
| 400 | `unknown tool <name>` | `PATCH` with `enabledTools` names a tool the server does not list |
| 404 | `Connection <id> not found` | unknown connection id |
| 404 | `Agent <id> not found` | a memory route for an unknown agent |
| 404 | `Memory <id> not found` | `DELETE /api/memories/:id` with an unknown id |
| 409 | `the built-in connection has no config` | `PATCH` with `config` on the built-in row |
| 409 | `the built-in connection cannot be deleted` | `DELETE` on the built-in row |
| 502 | the listing's message | `POST /api/connections` when the probe fails, and `PATCH` with `enabledTools` when the server cannot be listed |

Response shapes:

```
Run             = id, agentId, versionId, versionNumber, triggerKind, status, input, output,
                  tokensIn, tokensOut, costUsd, error, startedAt, finishedAt, createdAt
RunSummary      = Run + agentName
RunDetail       = RunSummary + events: RunEvent[] + approvals: Approval[]
PendingApproval = Approval + agentId, agentName, message   (message rendered from the run's saved state)
```

Field rules:

- `name`: at least one character. `description`: defaults to `''` on create.
- `status`: `draft`, `active` or `paused`.
- `draft`: a full `AgentDefinition`, checked with `validateDefinition` before it is stored.
- `note`: defaults to `''`.
- `input`: any JSON value, and the key is required. The web app sends a JSON object or array as that value, and any other text as trimmed text.
- `limit`: an integer from 1 to 200.

Behaviour:

- `name` and `description` are stored on the row and copied into the draft. The row's name wins, so a draft's own name is replaced. For `description`, a PATCH uses its own `description` if it has one, else its `draft`'s description, so a draft edit also changes the row's description.
- Publishing copies the current draft into `number = last + 1`. A `draft` agent becomes `active`. A `paused` agent stays `paused`.
- Deleting an agent cascades to everything it owns (section 6).
- A run's `output` is the value of the first output node it reaches. Its `costUsd` and tokens are the sums of its model calls, judge calls included.

Server-Sent Events (`GET /api/runs/:id/events`): each message is `event: run_event`, with `id` set to the event's `seq` and the `RunEvent` as its JSON data. Stored events are replayed first, then live events follow from the in-memory bus. A message is never sent twice. The stream ends with `event: done`, whose data is the final `Run`. A `: keep-alive` comment is sent after 15 s without events. The stream lives in this process: a restart ends it, and a reconnect replays the stored events.

Errors, all shaped `{ error, details? }`:

| Status | `error` | When |
|---|---|---|
| 400 | `validation` (with zod `details`) | a body or query fails the shared schema, including a missing `input` key |
| 400 | `invalid definition` (with `details`: string list) | `validateDefinition` finds problems, or a run starts before any version is published (`details`: `Publish a version first`) |
| 400 | `invalid JSON` | the body is not valid JSON |
| 404 | `Agent <id> not found` | unknown agent id |
| 404 | `Version <n> of agent <id> not found` | a `versionNumber` that does not exist |
| 404 | `Run <id> not found` | unknown run id, on detail, cancel and events |
| 404 | `Approval <id> not found` | unknown approval id, or one that belongs to another run |
| 409 | `approval already decided` | a second decision, or a decision on an expired approval |
| 409 | `run is not waiting for approval` | the run is not in `waiting_approval`. A guard: cancel expires approvals first, so a normal flow does not reach it. |
| 400 | `invalid cron` or `invalid timezone` | a schedule trigger whose cron or zone does not parse (`ValidationError`, from `db/triggers.ts`) |
| 404 | `not found` | a webhook call with an unknown or disabled secret |
| 409 | `agent is paused` or `agent has no version` | a webhook call for an agent that cannot run now |
| 404 | `Dataset <id> not found`, `Case <id> not found`, `Eval run <id> not found`, `Trigger <id> not found`, `Template <id> not found` | an unknown id on the eval, trigger and template routes. A dataset that belongs to another agent gives `Dataset <id> not found` when an eval run starts. |
| 409 | `Add a case to the dataset before running it` | `POST .../evals/runs` on a dataset with no cases |
| 409 | `only a schedule has a cron` | `PATCH /api/triggers/:id` with `cron` or `timezone` on a webhook |
| 400 | `validation` | a bad `days` value on `GET /api/insights`, or a draft description under 10 characters |
| 502 | `ANTHROPIC_API_KEY is not set (add it to .env)` | `POST /api/draft` without a key (the model is never called) |
| 502 | the model's error message | `POST /api/draft` when the model call fails, is refused or cut off, or its reply is not a valid definition (`DraftError`) |
| 500 | the error message | anything else; logged to the console |

Example, against a running server:

```sh
curl -s -X POST http://localhost:8787/api/agents -H 'content-type: application/json' \
  -d '{"name":"Triage","description":"Sort support email"}'
# 201: status "draft", currentVersion null
curl -s -X POST http://localhost:8787/api/agents/<id>/versions -H 'content-type: application/json' \
  -d '{"note":"v1"}'
# 201: number 1
curl -s -X POST http://localhost:8787/api/agents/<id>/runs -H 'content-type: application/json' \
  -d '{"input":"Where is my order?"}'
# 201: status "queued"; poll GET /api/runs/<runId> until succeeded, failed, cancelled or waiting_approval
curl -N http://localhost:8787/api/runs/<runId>/events
# replays run_event messages, then "event: done"
```

Wave-2 routes (contracts in `packages/shared/src/api/`: bodies, views and path helpers):

Evals:

| Method and path | Request | Response |
|---|---|---|
| `GET /api/agents/:id/evals/datasets` | none | 200 `EvalDataset[]`, newest first. 404 for an unknown agent. |
| `POST /api/agents/:id/evals/datasets` | `{ name }` | 201 `EvalDataset` |
| `DELETE /api/evals/datasets/:id` | none | 204, no body (its cases and eval runs go with it) |
| `GET /api/evals/datasets/:id/cases` | none | 200 `EvalCase[]`, in insertion order. 404 for an unknown dataset. |
| `POST /api/evals/datasets/:id/cases` | `{ name, input, scorers (1 or more), tags? }` | 201 `EvalCase` |
| `PATCH /api/evals/cases/:id` | any of `{ name, input, scorers, tags }` | 200 `EvalCase`. A missing `tags` keeps the stored tags. |
| `DELETE /api/evals/cases/:id` | none | 204, no body |
| `GET /api/agents/:id/evals/runs` | none | 200 `EvalRun[]`, newest first, up to 50. 404 for an unknown agent. |
| `POST /api/agents/:id/evals/runs` | `{ datasetId, versionNumber? }`. Defaults to the current version. | 202 `EvalRun`, status `queued`. Cases run in the background. |
| `GET /api/evals/runs/:id` | none | 200 `EvalRunDetail`: the run, its dataset name and one result per case (with the case name) |

Triggers and webhooks:

| Method and path | Request | Response |
|---|---|---|
| `GET /api/agents/:id/triggers` | none | 200 `TriggerView[]`, oldest first |
| `POST /api/agents/:id/triggers` | `{ kind: 'schedule', cron, timezone? (default UTC) }` or `{ kind: 'webhook' }` | 201 `TriggerView`. A webhook gets its secret here; `webhookUrl` is `/hooks/<agentId>/<secret>`, and schedules get `null`. |
| `PATCH /api/triggers/:id` | any of `{ enabled, cron, timezone }` | 200 `TriggerView`. `cron` and `timezone` apply to schedules only. |
| `DELETE /api/triggers/:id` | none | 204, no body |
| `POST /hooks/:agentId/:secret` | any JSON body (not under `/api`) | 202 `{ runId }`. A body with an `input` key is unwrapped; any other body is the input. An empty body is `{}`. |

Every trigger write calls `scheduler.reload()`, so a change takes effect at once. A webhook route is open to anyone who has the URL.

Draft and templates:

| Method and path | Request | Response |
|---|---|---|
| `POST /api/draft` | `{ description (10 or more characters), model? (default claude-sonnet-5-5) }` | 200 `{ definition, problems }`. `problems` is empty when the draft is valid. Nothing is saved. |
| `GET /api/templates` | none | 200 `TemplateSummary[]`: `id`, `name`, `description`, `category`, `nodeCount` |
| `POST /api/templates/:id/agents` | `{ name? }`. Without `name`, the template's name is used. | 201 `Agent`, already published as version 1 |

Insights and health:

| Method and path | Request | Response |
|---|---|---|
| `GET /api/insights` | query: `days` (7, 14 or 30; default 30), `agentId?` | 200 `InsightsOverview` (below) |
| `GET /api/agents/:id/health` | none | 200 `HealthScores` (`adherence`, `autonomy`, `efficiency`, `overall`, `sampleSize`, `computedAt`), or JSON `null` when the agent has no finished runs in the last 7 days. 404 for an unknown agent. |

`InsightsOverview` = `days`, `from`, `to`, `totals` and `previous` (the same shape as `totals`, for the window before it), `series` (one `{ day, runs, failed, spendUsd }` per day, zeros included), `byAgent` (`agentId`, `agentName`, `runs`, `successRate`, `spendUsd`, `health`) and `byModel` (`model`, `calls`, `spendUsd`, from `model_call` events). `totals` has `runs`, `succeeded`, `failed`, `waitingApproval`, `handedToPerson`, `errorRate`, `spendUsd`, `meanCostUsd` and `p50DurationMs`. Eval runs are left out of every part.

Shapes for the new routes: `EvalDataset` = id, agentId, name, createdAt. `EvalCase` = id, datasetId, name, input, scorers, tags. `EvalRun` = id, agentId, datasetId, versionId, versionNumber, status (queued, running, succeeded, failed), summary (or null), createdAt, finishedAt. `EvalResult` = id, evalRunId, caseId, runId, pass, scores, costUsd, latencyMs. `TriggerView` = a `Trigger` (id, agentId, kind, config, enabled, createdAt) plus `webhookUrl`.

## 8. Server internals

- **Boot** (`index.ts`): loads `.env` from the repo root if it exists. Reads `PORT` (default 8787), `DB_PATH` (default `data/agentforgeloop.db`, resolved from the repo root) and the optional `ANTHROPIC_API_KEY`. Creates the data folder, opens the database, runs migrations, seeds, and fails interrupted runs (`recoverInterruptedRuns`), then fails interrupted eval runs (`failInterruptedEvalRuns`). Builds the engine dependencies (`db`, `llm = createLlm(key)`, the tool registry `createToolRegistry(builtinTools, listConnections)` with a background `tools.refresh()` that lists every MCP connection, a `RunBus`, and `apiKey`, the only place the key reaches the draft endpoint), starts the scheduler (`startScheduler(engine)`), creates the app with `createApp(db, engine, scheduler)`, serves `apps/web/dist` if it exists, and listens. Without a key, every model call fails with `ANTHROPIC_API_KEY is not set (add it to .env)` and the rest of the app works. The web build's `index.html` is read on each request, so a rebuilt web app needs no server restart, provided `apps/web/dist` existed at boot.
- **App** (`app.ts`): `GET /api/health` returns `{ ok: true, version }`, with the version read from the root `package.json`. Mounts `routes/agents.ts` at `/api/agents`; `routes/runs.ts`, `routes/approvals.ts`, `routes/evals.ts`, `routes/draft.ts`, `routes/insights.ts`, `routes/triggers.ts`, `routes/connections.ts` and `routes/memories.ts` at `/api` (their paths carry the full suffix, for example `/agents/:id/evals/datasets`); and `routes/hooks.ts` at `/hooks`. `onError` maps errors to HTTP (section 7): `ValidationError` to 400, `ConflictError` to 409, `NotFoundError` to 404, `DraftError` to 502, and the rest as listed there. `createApp(db, engine, scheduler)` defaults to an engine without a key and a scheduler that does nothing, so route tests need neither.
- **Static web** (`index.ts`): when `apps/web/dist` exists, non-API GET requests return the built `index.html`, so client-side routes work. Unknown `/api/` GET paths return `{ error: 'not found' }` with 404.
- **Agent routes** (`routes/agents.ts`): one Hono sub-app. It reads the body (an empty body counts as `{}`; malformed JSON throws, which maps to 400), parses it with the shared schema, calls one `db/agents.ts` function and returns the result.
- **Run routes** (`routes/runs.ts`): list, start, detail, cancel and events. Start creates the run and returns it as `queued`. The walk runs after the response.
- **Event stream** (`routes/run-stream.ts`): subscribes to the bus first, then replays stored events, then sends live ones, skipping any seq already sent. Ends with `done` after `run_end`, and stops when the client disconnects.
- **Approval routes** (`routes/approvals.ts`): the pending queue, and decide. A decision parses its body and calls `decideApproval` in `engine/approvals.ts`. Approve calls `resumeRun` (not awaited). Reject calls `rejectRun`. Every route that reads a body uses `readJson` from `routes/read-json.ts`: an empty body is `{}`, and malformed JSON is a 400.
- **Connection and memory routes** (`routes/connections.ts`, `routes/memories.ts`): parse the body, call `db/connections.ts` or `db/memories.ts`, and keep the registry in step. A new MCP connection is probed before it is saved, so an unreachable server gives a 502 and no row. A PATCH with `enabledTools` checks each name against the tools the server lists (400 for an unknown one). A changed `config`, a refresh and a delete call `engine.tools.refresh(id)`, so the old client is closed.
- **Connection and memory rules** (`db/connections.ts`, `db/memories.ts`): every memory call checks that the agent exists (404), except `DELETE /api/memories/:id`, which checks only the memory id (404). `listMemories` is newest first and takes an optional limit. `searchMemories` is a substring match done with SQL `LIKE` (wildcards in the query are literal), case-insensitive for ASCII letters only, with no index, so it scans the agent's facts. It returns 5 results by default; `memory_search` uses that default. The AI step's facts block uses `listMemories` with a limit of 20 (section 14). The built-in connection row cannot take a config or be deleted: `ConflictError` (409).
- **Run rules** (`db/runs.ts`): resolves the version to run, inserts runs, appends events with the next `seq` (single-threaded, so no race), loads a run with its definition and state, updates only the fields given, lists runs and builds the detail, and fails interrupted runs at boot.
- **Triggers** (`db/triggers.ts`, `routes/triggers.ts`): a trigger is a schedule (cron and IANA zone) or a webhook. `scheduleProblem` checks a cron and a zone, and `createTrigger` and `updateTrigger` throw `ValidationError` (400) when it fails, so any caller gets the same rule. A webhook gets a random 32-character hex secret, compared in constant time. Each write calls `scheduler.reload()`. `scheduleSkipReason` says why an agent cannot run now (paused, no version, deleted); the scheduler and the webhook route both use it.
- **Scheduler** (`scheduler.ts`): in-process. `startScheduler(deps)` registers one croner job per enabled schedule trigger, in the API's own Node process, and `reload()` rebuilds the jobs after each trigger write. A firing calls `startRun` with trigger `schedule` and input `{ scheduledAt }`, unless `scheduleSkipReason` gives a reason, which is logged. A stored cron that no longer parses is logged and skipped. Nothing is run for a firing that falls while the server is down, and a slow run can overlap the next firing (there is no concurrency limit). `stop()` stops the jobs, and `index.ts` does not call it.
  - **Approval expiry.** A second job runs on every minute and calls `expireTimedOut`. It finds pending approvals whose node has `timeoutMinutes` and whose `requested_at` plus that time is past (`dueApprovals`). For each one, `timeOutApproval` marks it `expired` (a decision already made wins, so it is skipped), appends `approval_resolved` with status `expired`, then either resumes the run past the approval (`onTimeout: approve`) or rejects it with `Approval timed out` (`onTimeout: fail`, the default). The check runs in the same process, so an approval is not timed out while the server is down; the next minute after boot catches up.
- **Webhooks** (`routes/hooks.ts`): `POST /hooks/:agentId/:secret` runs `resolveWebhook` (404 for an unknown or disabled secret, 409 when the agent cannot run), then starts a run with trigger `webhook`. A JSON body with an `input` key is unwrapped; any other body is the input.
- **Describe to draft** (`draft.ts`, `routes/draft.ts`, `templates.ts`): one model call with the instructions and the `AgentDefinition` JSON Schema. The schema goes in as structured output (`output_config.format`) in a closed, structured-output copy (`toStructuredSchema`, which drops the numeric and length limits and the `pattern` and `default` keywords; zod still checks them on the reply). Any 400 from that request makes the call retry once with the same schema as a non-strict tool, `propose_agent`. The fallback exists because the API may reject that grammar for this schema (the note in `callDraftModel`). Neither path has been run against the live API (section 14). The reply is parsed, checked by zod, and then by `validateDefinition`; problems go back to the model once. The draft takes the model picked in the dialog for the agent and for every AI step, and `autoLayout` places the nodes. A failed model call throws `DraftError` (502). `apiKey` comes from `EngineDeps`, which `index.ts` fills from `.env`; `draft.ts` never reads the environment. Templates are three built-in definitions. `POST /api/templates/:id/agents` creates the agent and publishes version 1.
- **Insights** (`db/insights.ts`, `routes/insights.ts`): `GET /api/insights?days=7|14|30&agentId=&timezone=` returns the window totals, the totals of the window before it, one point per day for the window (`series`) and for the window before it (`previousSeries`), a row per agent (with its health, failed count and handed-to-person count) and a row per model (from `model_call` events). Every query leaves out eval runs (`NON_EVAL_SQL`). The health route answers 404 for an unknown agent id (`getAgent`). The `byAgent` health in the overview is `computeHealth` for each agent, always over 7 days, whatever `days` is. The window is the last `days` calendar days of `timezone` (an IANA zone, default `UTC`; an unknown one is a 400 `invalid timezone`). The day buckets are computed in JavaScript with `Intl.DateTimeFormat`, because SQLite cannot convert zones. The web sends the browser's zone.
- **Health** (`engine/health.ts`): over the finished runs (`succeeded`, `failed`, `cancelled`) of the last 7 days, by `finished_at`, with eval runs left out. `sampleSize` is the number of those runs (`N`). With `N = 0`, the result is null.
  - `adherence = round(100 × runs with no problem / N)`. A run has a problem when it has a `tool_result` event with `isError` true, or a `check_result` event with `pass` false.
  - `autonomy = round(100 × runs with no approval_requested event / N)`. A run that asked a person to decide is not autonomous.
  - `efficiency = 100` when the 7-day median cost is at most the 30-day median (30 days of finished runs, eval runs excluded). Otherwise `round(100 × 30-day median / 7-day median)`, floored at 0.
  - `overall = round((adherence + autonomy + efficiency) / 3)`.
  - Medians use the average of the two middle values for an even count.
  - `GET /api/agents/:id/health` returns the scores, or `null`. Eval cases are excluded, so a deliberately failing dataset does not lower an agent's score.
- **Eval runs at boot**: `failInterruptedEvalRuns` (`db/evals.ts`) marks eval runs left `queued` or `running` as `failed` at boot. The eval runner works in the process, so a restart would otherwise leave them spinning in the UI.
- **Eval rules** (`db/evals.ts`): creates and reads datasets, cases and eval runs, and inserts results. Rows are mapped through the shared schemas, and the scorers and tags are stored as JSON. Unknown ids throw `NotFoundError`. `getEvalRunDetail` joins the dataset name and each case's name.
- **Evals** (`evals/runner.ts`, `evals/scorers.ts`): `startEvalRun` checks that the dataset belongs to the agent and has cases, resolves the version, inserts the eval run as `queued` and returns. In the background it runs each case through `startRun` with trigger `eval`, three at a time, and polls each run every 300 ms until it ends. After 5 minutes the run is cancelled and its case fails. `score` checks one scorer against the run's output, events and cost. A scorer that throws fails its case. A case passes when its run succeeded and every scorer passes. The summary is the pass rate, the mean cost and the nearest-rank p50 latency. In an eval run an approval node passes on its own (`engine/nodes/approval.ts`).
  - **Scorers** (`Scorer` in `packages/shared/src/schema/eval.ts`, scored in `score`): `exact` (the trimmed output equals `expected`), `contains` (case-insensitive substring), `json_schema` (the output, parsed when it is a string, passes the shared JSON Schema subset, section 14), `llm_judge` (the judge model gives a pass verdict against `rubric`, so its score is 1 or 0; `threshold` is stored but unused), `tool_calls` (every tool in `tools` appears in a `tool_call` event), `latency` (run time at most `maxMs`) and `cost` (run cost at most `maxUsd`). Reasons are shortened to 120 characters.
  - A scorer that throws (for example the judge with no key) fails its case and keeps the message as its reason. The run and the scorers of one case run one after another.
- **Approval rules** (`db/approvals.ts`): creates and decides approvals (a decision on a non-pending approval changes nothing), lists pending approvals with the agent name and the message rendered from the run's saved state (the same text as the `approval_requested` event), and expires a cancelled run's pending approval.
- **Agent and version rules** (`db/agents.ts`): checks each definition with `validateDefinition`. Keeps name and description in step on the row and in the draft. Publishes inside a transaction. Throws `NotFoundError` and `InvalidDefinitionError` (both in `errors.ts`).
- **Database** (`db/sqlite.ts`): `openDb` turns on foreign keys, and WAL unless the path is `:memory:`. Helpers: `all`, `get`, `run` (returns the number of changed rows), `transaction` (BEGIN, COMMIT or ROLLBACK), `migrate`, `newId` (UUID) and `nowIso`.
- **Seed** (`seed.ts`): when the database has no agents, creates "Support email triage" and publishes version 1. The agent's model is `claude-haiku-5-5`, so manual checks stay cheap. The graph: trigger, an AI step that classifies and drafts a reply, a regex check that blocks card numbers in the input (`target: input`; the pattern matches 13 to 19 digits, each optionally followed by a space or dash; a failure routes to a manual-handling output), an approval, and two outputs: `send` (the reply) and `blocked` (manual handling). It also inserts the `builtin` connection row (`now`, `http_request`, `memory_save`, `memory_search`) when the `connections` table is empty. Running the seed again changes nothing.
- **Engine** (`engine/`):
  - `executor.ts`: `startRun`, `executeRun`, the walk (`walk`), `resumeRun`, `cancelRun`, `recoverInterruptedRuns`, and `emitEvent` (append, then publish). Keeps one `AbortController` per run that is walking in this process. `nextNode` takes the edge with the requested label, else the unlabelled edge. Exports `finish` and `waitedMs` for `approvals.ts`.
  - `approvals.ts`: `decideApproval` (the guards, the record, then resume or reject), `rejectRun` and `timeOutApproval`. Imports from `executor.ts`; nothing imports back.
  - `nodes/index.ts`: an exhaustive `switch` on the node type, so each handler gets its own node type. A handler returns `next` (an optional label and `prev`), `wait` (an approval id) or `fail`. A throw becomes `fail`. The trigger returns `next` with no label.
  - `nodes/ai.ts`: the system blocks are the principles (cached with `cache_control`), then, when the agent's memory is on, one cached block with its 20 newest facts (`listMemories`; the step logs `Loaded N memories`), the node prompt, `Agent: <name>. <description>`, and a fixed line that the input and the previous result are in the user message. The user message is `JSON.stringify({ input, prev })`. The node's model and effort override the agent's; otherwise the agent's apply. Tools come from the node, or from the agent when the node lists none. Each tool runs with a `ToolContext` (`db`, and the agent and run ids read from the run), so the memory tools write to the right agent. Each model call emits `model_call` (model, tokens, cache tokens, cost, stop reason, duration). On `tool_use`, the calls run in parallel, each emitting `tool_call` and `tool_result`, and their results go back as one user message. An unknown tool name returns an error result to the model. A reply that is JSON becomes `prev` (a code fence around it is allowed); other text stays text. `max_tokens` and `refusal` fail the step, and so does any other stop reason. The step makes at most `maxTurns` model calls, then fails if it is still calling tools.
  - `nodes/code.ts`, `branch.ts`, `output.ts`: `sandbox.ts` for Code and Branch, `template.ts` for Output.
  - `nodes/check.ts` and `checks.ts`: section below.
  - `nodes/approval.ts`: creates the approval row, emits `approval_requested` with the rendered message, and returns `wait`.
  - `llm.ts`: `createLlm(apiKey)`. An empty key counts as missing: every call then rejects with `ANTHROPIC_API_KEY is not set (add it to .env)`. `message()` streams a reply with `max_tokens` 16000, `output_config.effort`, the system blocks, the messages and, when there are any, the tools. It returns the final message, usage, cost and duration. No `thinking` parameter is sent. `judge()` uses the judge model, `claude-haiku-5-5`, unless a caller passes another model (the checks never do). It runs at effort `low`, with a JSON-schema output (`pass`, `reason`). It throws when the reply is a refusal or is cut off. It takes an optional abort signal. Known SDK errors become short messages: 401 becomes `Anthropic rejected the API key (check ANTHROPIC_API_KEY)`, 429 becomes `Anthropic rate limit reached; try again shortly`, 400 becomes `Anthropic rejected the request: <message>`, and other API errors become `Anthropic API error <status>: <message>`.
  - Price table (`PRICES` in `llm.ts`), USD per million tokens. Cost is each token count times its price, summed over the four kinds:

    | Model | Input | Output | Cache read | Cache write |
    |---|---|---|---|---|
    | `claude-sonnet-5-5` (default) | 2.00 | 10.00 | 0.20 | 2.50 |
    | `claude-opus-5-5` | 4.00 | 20.00 | 0.20 | 5.00 |
    | `claude-haiku-5-5` | 0.10 | 0.50 | 0.01 | 0.125 |

    The table is as written in the code. This update did not check it against a current price list. A new model needs an entry here; the `Record` type makes TypeScript fail until it has one.
  - `tools/`:
    - `registry.ts` gives each tool ref the name the model sees, `<connectionId>__<tool>` (for example `builtin__now`), with `strict: true` only for built-in tools. MCP schemas are not ours, and strict mode rejects most of them, so MCP tools go out non-strict. `resolve` is synchronous: a ref that is not in the current tools throws `Unknown tool "<connection>/<tool>"`, so the step fails with that message. `call` never throws: an unknown tool or a thrown error comes back as a result with `isError`.    - Registry lifecycle: `createToolRegistry(defs, loadConnections, createClient)`. Each call reads the connections from the database, so an enabled-tools change applies at once without listing the server again. An MCP connection is listed the first time its tools are needed, in the background (`ensureListed`); a run that needs them before that listing ends gets `Unknown tool`. Boot starts a listing of every MCP connection (`tools.refresh()`). `listing(id)` waits for the listing and is what the API reads for `status` and `tools`. `refresh(id)` lists again: it closes the old client and waits for any listing already running for that connection, so each client is closed by the listing that replaces it. A failed listing is kept as the error until the next refresh or config change. `probe(config)` lists a config and closes its client, with no cache. `close()` closes every cached client, but nothing calls it yet, so stdio servers are not stopped when the API exits.
    - `builtin.ts`: `now` (the ISO time and the server's time zone) and `http_request` (https only; GET or POST; a required, nullable `body`; no headers input; a 10 s timeout for the whole call; the whole response is read, then cut to 50 KB; a status of 400 or more is returned as an error result). `memory_save` stores a fact for the run's agent, with the run as its source. `memory_search` returns the facts that contain the text, ignoring case, newest first, up to 5. Both memory tools throw without a `ToolContext`, so `call` returns an error result.
    - `types.ts`: the `ToolDef` shape that built-in and MCP tools share, and `ToolContext` (`db`, `agentId`, `runId`), the optional third argument of `run`.
    - `mcp.ts` (`createMcpClient`), the MCP client lifecycle: the transports are stdio (`command`, `args`, and an environment of the SDK's default variables plus the connection's `env`; the app's own environment, including `ANTHROPIC_API_KEY`, is not passed on) and streamable HTTP (`url`). The client connects on first use, with a 10 s connect timeout. A failed connect, or a lost connection (`onclose`: the process exited, the HTTP session dropped), is forgotten, so the next call reconnects. The reset checks the connection's identity, so a late close cannot clear a newer one. Listing waits at most 10 s and a tool call 30 s; the call also honours the run's abort signal. A failed or timed-out call comes back as an `isError` result and never throws; the output is `structuredContent`, or else `content`.
  - `sandbox.ts`: `runCode` runs a Code step's source as the body of a function in a new `node:vm` context. `input`, `vars` and `prev` are copied in as JSON, so the step gets no host objects. The return value becomes `prev`. A 2 s timeout stops the step, and `vars` is written back. `evalExpression` does the same for a Branch expression and uses its truthiness. A test checks that the host process is not reachable through constructors. The context is not a security boundary, so this is for the user's own code.
  - `template.ts`: `render` replaces each `{{ path }}` (a dotted path over `input`, `vars`, `prev`). Strings go in as they are, other values as JSON, and missing values as empty text.
  - `bus.ts`: `RunBus`, an in-memory `EventEmitter` keyed by run id, with no listener limit.
  - `types.ts`: `RunStateSchema` (input, vars, prev, nodeId, costUsd, tokensIn, tokensOut, toolsUsed), saved in `runs.state_json` after each completed node and at each approval wait. Also `NodeOutcome`, `EngineDeps`, `NodeIo` and `NodeHandler`.
  - `json-schema.ts`: the validator for `json_schema` checks. See section 14 for what it does not check.
  - `testing.ts`: test-only helpers (`fakeLlm`, `textMessage`, `toolUseMessage`, `testEngine`, `publishAgent`, `waitFor`). Nothing in the app imports it.
- **Background timers**: the scheduler's croner jobs (section 8), the SSE keep-alive wait, the 10 s `http_request` timeout, and the MCP listing and call timeouts (10 s and 30 s).

**Checks in the walk.** A check node calls `runCheck` (`engine/checks.ts`) and emits `check_result` (`kind`, `pass`, `reason`). A regex check blocks or requires a match in its target: a string is used as it is, any other value as JSON. A `json_schema` check validates its target (a string is parsed as JSON first). An `llm_judge` check asks the judge, and its cost and tokens are added to the run and recorded as a `model_call`. A `cost_cap` check passes while the run's cost so far is at most `maxUsd`. A `tool_allowlist` check passes when every tool used, named `<connectionId>__<tool>`, is on the list. Then the node either follows the `pass` edge, follows the `fail` edge (`onFail: route`), or fails the run with `Check "<label>" failed: <reason>` (`onFail: stop`). A bad regex, or a bad `pattern` inside a JSON schema, throws, and the run fails with that message.

## 9. Web app

- **Entry**: `main.tsx` renders `App` from `app.tsx` in StrictMode and loads `styles.css`. `app.tsx` provides React Query (one retry), the toast provider, and a `createBrowserRouter` with one layout route: `AppShell` around an `Outlet`.
- **Routes**: `/` (agents list), `/agents/:id` (agent page), `/runs` (approval queue and all runs), `/runs/:id` (run page), `/insights` (Insights page). `/connections` lists the built-in tools and the MCP servers. Any other path shows "Page not found".
- **Agents list** (`pages/agents.tsx`): one card per agent (status, version, name, description). "New agent" opens `NewAgentDialog` (`features/agents/new-agent-dialog.tsx`), with three tabs:
  - **Describe** (`describe-agent-form.tsx`, `draft-preview.tsx`): a description of at least 10 characters and a model (the product default is selected). "Draft it" calls `POST /api/draft` and shows the steps in flow order and any problems. "Create agent" is enabled only with no problems. It saves the drafted definition as a **draft** agent with no version, and opens it. Publish it from the agent page when it is ready.
  - **Blank** (`blank-agent-form.tsx`): a name and an optional description. It creates the default draft (trigger, AI step, output).
  - **Template** (`template-agent-list.tsx`): the three built-in templates (Support email triage, Invoice data extraction, Daily news digest), each with its step count. "Use template" creates the agent and publishes version 1, then opens it.
- **Agent page** (`pages/agent.tsx`): a header and the tabs Build, Runs, Evals, Insights and Memory. Evals renders `EvalsTab` (`features/evals/`), Insights renders `InsightsTab` (`features/insights/`): the window select, the KPI tiles, the spend chart and the agent's health panel, and Memory renders `MemoryTab` (`features/memory/`, below). The Build panel stays mounted while another tab is open, so a pending autosave is not interrupted. `RunConsole` is a drawer at the bottom of the page. When open it takes `max(280px, 40vh)`, and the tab area above it takes the rest of the height and scrolls.
- **Memory tab** (`features/memory/`): the facts, newest first, each with a delete button. `Clear all` asks first. `add-fact-form.tsx` adds a fact. A note says memory is off when the agent's switch is off; facts can still be added, and they are used once the switch is on. The switch is in agent settings.
- **Connections page** (`pages/connections.tsx`, `features/connections/`): one card for the built-in tools (always available) and one per MCP server. Each tool has a switch. MCP cards have refresh and delete (delete asks first). `add-server-dialog.tsx` adds a server: an HTTP URL, or a stdio command with arguments and `KEY=value` environment lines. `server-config.ts` builds the config (tested). Saving probes the server, so an unreachable one shows its error and nothing is saved.
- **Tool picker** (`features/canvas/node-forms/tool-picker.tsx`): the AI step's tool checkboxes, grouped as Built-in and then one group per server, with enabled tools only. A saved tool that is no longer listed stays under `Unavailable`, checked, so it can be unchecked.
- **Header** (`features/agents/agent-header.tsx`): click the name to rename (Enter or blur saves, Escape cancels). Next to the status badges it renders `TriggerChip` (`features/triggers/`: the enabled triggers in words, which opens the Triggers dialog) and `HealthRing` (`features/insights/`: the overall score once the agent has finished runs). Run focuses the run console's input. Publish creates a version with an empty note and shows a toast. Publish is disabled unless the draft is saved (the Build tab reports `idle` or `saved` through `onPublishable`), so unsaved or invalid edits are never dropped by a publish. The server still publishes the last saved draft. The More menu (`agent-menu.tsx`) deletes the agent after a confirmation dialog.
- **Build tab** (`features/canvas/build-tab.tsx`): three columns from 1280 px up (palette, canvas, inspector) and stacked below. Remounted per agent, so the draft resets.
  - `use-definition.ts` owns the draft: the definition (starting from `agent.draft`), the node selection (view state, not saved), React Flow's measured node sizes (so edges survive rebuilds), a dirty flag and the save status. Every change to the definition calls a debounced save (`use-debounced-save.ts`). The timer restarts on each change, and the latest value is saved 500 ms after the last one. A pending save is flushed on unmount. The save sends `{ draft }` only when `getProblems` finds no problems. Otherwise nothing is sent, and the status reads "Not saved yet".
  - The status line reads Saving…, Saved, Couldn't save (the request failed) or Not saved yet (the draft has problems).
  - `problems-banner.tsx` lists the client-side problems, or the server's 400 details after a failed save. Dismissing it hides the list until the list changes.
  - `definition-graph.ts` (pure, tested) converts between the definition and React Flow (`toFlowNodes`, `toFlowEdges`) and holds the graph edits (`createNode`, `connectNodes`, `replaceNode`, `moveNodes`, `removeElements`, `updateSelection`). `getProblems` reports, in order: schema issues (and stops there), the graph rules of `validateDefinition`, then each node after the trigger with no incoming edge.
  - `connectNodes` keeps one edge per source handle. Branch handles are labelled `true` and `false`, and check handles `pass` and `fail`. Connecting from the trigger replaces its edge to the first step, so `getProblems` reports that step as having no incoming edge until it is connected.
  - `replaceNode` drops a check's fail edge when the check is switched to `stop`.
  - `createNode` gives each kind the defaults it needs to pass the schema. An AI step starts with a placeholder prompt and 8 turns; a check starts as a regex that blocks matches in the output.
  - `palette.tsx` lists the seven kinds from `NODE_INFO` and hides the trigger once one exists. A click adds a node after the last node. Dragging a kind onto the canvas adds it where it is dropped.
  - `canvas.tsx`: React Flow with the card components in `nodes/`, one per kind. Delete and Backspace remove the selection. The dot grid is React Flow's `Background`; the `canvas-surface` class points React Flow's CSS variables at the app's tokens.
  - Node cards (`nodes/node-card.tsx`): the kind's icon and rail, the label, the kind, and one summary line (`node-summary.ts`). Each card has a target handle on the left (not the trigger) and source handles on the right. Check cards show `pass`, and `fail` too when `onFail` is route. Branch cards show `true` and `false`. Live run marks come from `useActiveRun`: a pulsing ring on the running node, a tick on finished nodes, a red ring on the failed node.
  - `inspector.tsx`: with a node selected, `node-inspector.tsx` shows its label, the kind's form from `node-forms/` and a Delete node button. With nothing selected, `agent-settings.tsx` shows the description, model, effort, principles (markdown) and a memory switch.
  - Forms: the AI prompt, the code step and the JSON schema use CodeMirror (markdown, JavaScript and JSON). The AI form also sets the model and effort (inherit, or a model), the maximum turns (1 to 50) and the tools (the tool picker above). The check form sets the kind (regex, JSON schema, LLM judge, cost cap, tool allowlist), that kind's fields and "When it fails" (stop the run, or follow the fail edge). The approval form sets the message. Its timeout and "On timeout" fields are enforced by the per-minute expiry (section 8). The memory switch turns on the facts block in each AI step (section 8).
- **Runs** (`features/runs/`):
  - `api/sse.ts` (the SSE client): `subscribeRun` opens an `EventSource` on `/api/runs/:id/events`, checks each message against the shared schemas, drops repeated seq values, and closes on `done`. A message that fails the schema is reported, and the stream stays open. If the browser closes the stream for good, the feed reports that it was lost. While the browser is retrying, nothing is reported.
  - `active-run.ts` is a small store holding the run the agent page follows: its run and agent ids, status, running node, finished nodes and failed node. It is reduced from events: `node_start` sets the running node; `node_end` clears it and records the node as finished or failed; `approval_requested` sets `waiting_approval`; `approval_resolved` sets `running`; `run_end` sets the final status. Starting a run records its run and agent. `useActiveRun(agentId)` returns the run only when it belongs to that agent, so another agent's page shows no run, no spinner and no node marks.
  - `run-console.tsx` (the bottom drawer): a bar with the run status, cost and tokens, and a toggle. Open, it shows an input box, Run, and Cancel while a run is busy. A JSON object or array in the box is sent as that value, and any other text is sent trimmed. The hint reads "Publish first" when the agent has no version, and "Running…" while busy. "Open run" links to the run page once the run ends. The live feed (`run-feed.tsx`, with `run-event.tsx` describing each event) shows one row per event, and an approval row gets Approve and Reject. Totals come from the final run when it has ended, and from `model_call` events while it runs. When a run ends, the console refreshes all run queries. Opening the agent page with a run in the store replays that run's stored events first.
  - `pages/run.tsx` and `run-detail-view.tsx` (`/runs/:id`): the status, Run again (the same input on the agent's current version), the agent, the version, the trigger, the stats (duration, cost, tokens in and out), the run's error, a card for each pending approval with its message and Approve and Reject (`approval-actions.tsx`, with an optional note), the input and output, and the timeline (`run-timeline.tsx`). The timeline groups events by node, with each group's duration, and labels nodes from the run's own version. The page refetches every 1.5 s while the run is active.
  - `pages/runs.tsx` (`/runs`): the "Needs approval" queue (`pending-approvals.tsx`, oldest first, with the agent name, message and a link to the run), and "All runs" (`runs-table.tsx`) with a status filter. `runs-tab.tsx` shows one agent's runs in the same table.
  - Approval decisions refresh all run queries and the approval queue.
- **Triggers** (`features/triggers/`):
  - `trigger-chip.tsx`: the header chip, which summarises the enabled triggers (`summarizeTriggers`: a cron in words, "Webhook", or "Manual" when none is enabled). Clicking it opens the Triggers dialog.
  - `trigger-dialog.tsx` (Triggers): a list (`trigger-list.tsx`) with an on/off switch and a delete button per trigger, and "Add trigger". Adding a **Scheduled** trigger shows `schedule-form.tsx`: repeat every N minutes, hours or days; on chosen days at a time; or monthly on a day from 1 to 28. A time zone list (`timeZoneOptions`, the browser's zone first) comes with it. `schedule.ts` (pure, tested) builds the cron and reads it back in words (`describeCron`). Adding a **Webhook** creates it at once and shows `webhook-details.tsx`: the full URL with a Copy button and a curl example. The URL is shown here and in the list. Anyone with it can start a run.
- **Evals** (`features/evals/`, the Evals tab):
  - `evals-tab.tsx`: two columns. On the left, `datasets-panel.tsx` (create and delete datasets) and `cases-panel.tsx` with `case-dialog.tsx` (name, input as JSON or text, tags, and one or more scorers from `scorer-editor.tsx`). The first dataset is selected by default.
  - On the right, `eval-runs-panel.tsx`: `run-evals-form.tsx` (a version, defaulting to the current one, and the run button), `eval-run-list.tsx`, and `eval-results.tsx` for the selected run. A run that is queued or running shows a spinner. A failed run shows a short message. A finished run shows `summary-tiles.tsx` (passed count, pass rate, mean cost, p50 latency) and `results-table.tsx` (one row per case, with its scorer chips and a link to the case's run).
  - **Compare**: "Compare with…" lists the other succeeded runs of the dataset. `compare-view.tsx` shows the deltas of the three summary numbers, then each case with both verdicts side by side. The selection is page state, so it resets on reload.
  - Scorers are built in `scorer-builder.ts` (`SCORER_KINDS`, `SCORER_FIELD`, `buildScorer`, `scorerChipLabel`). It is pure and tested.
- **Insights** (`features/insights/`, the Insights page and the agent's Insights tab):
  - `window-select.tsx` (7, 14 or 30 days) and `when-loaded.tsx` (loading, error and empty states).
  - `kpi-tiles.tsx`: Runs, Success rate, Handed to a person, Runs with errors and Spend, each with the change against the window before it (`trendOf`).
  - `spend-chart.tsx`: a bar chart of spend per day. The previous window is not drawn (section 14).
  - `agent-table.tsx` (per agent: runs, success rate, spend, health) and `model-table.tsx` (per model: calls and spend).
  - `attention-list.tsx`: "Needs attention" and "Going well", from `attentionRules`. Needs attention: a success rate under 80%, or a person was asked in more than half of the recent runs (`autonomy` under 50 from the 7-day health). Going well: every run succeeded and there are at least 5 runs. Each flag links to its agent.
  - The agent's Insights tab (`insights-tab.tsx`) shows the same tiles and chart for one agent, and `health-scores.tsx` (the overall score and its three parts: adherence, autonomy, efficiency).
  - **Health ring** (`health-ring.tsx`): in the agent header, next to the status. It shows the overall score as a ring, with a tooltip of the three parts. It renders nothing until the agent has finished runs in the last 7 days. The bands are Good (80 and up), Warning (60 to 79) and Critical (below 60).
- **Data layer** (`api/client.ts`): `request()`, the only `fetch` call, exported so the wave-2 `api/*.ts` files share it. The rule: no other file in `apps/web/src` calls `fetch`, and each `api/*.ts` file imports `request()` and parses responses with the shared schemas. It parses each response with the shared schemas. Agent hooks: `useAgents`, `useAgent(id)`, `useCreateAgent`, `useUpdateAgent(id)`, `useDeleteAgent(id)`, `usePublishVersion(id)`. Run hooks: `useRuns(filter)`, `useAgentRuns(id)`, `useRun(id)` (refetches every 1.5 s while active), `useStartRun(agentId)`, `useCancelRun`, `usePendingApprovals`, `useDecideApproval`. Wave-2 hooks: `useDraftAgent`, `useTemplates`, `useCreateFromTemplate` (`api/draft.ts`); `useDatasets`, `useCases`, `useEvalRuns` and `useEvalRun` (both refetch every 2 s while a run is active), `useStartEvalRun` (`api/evals.ts`); `useTriggers`, `useCreateTrigger`, `useUpdateTrigger`, `useDeleteTrigger` (`api/triggers.ts`); `useInsights(days, agentId?)` and `useAgentHealth(id)` (`api/insights.ts`). Wave-3 hooks: `useConnections`, `useCreateConnection`, `useUpdateConnection(id)`, `useDeleteConnection`, `useRefreshConnection` (`api/connections.ts`); `useMemories(agentId)`, `useCreateMemory(agentId)`, `useDeleteMemory(agentId)`, `useClearMemories(agentId)` (`api/memory.ts`). Writes invalidate their query keys, and run keys share the `['runs']` prefix. `errorMessage(error)` turns any error into short text for toasts and error states.
- **UI kit** (`components/ui/`): hand-written. Dialog, Select, Switch, Tabs and Tooltip wrap radix-ui primitives. The Toast provider is a small React context; `useToast` must run inside `ToastProvider`.
- **Styles** (`styles.css`): Tailwind 4 `@theme` tokens. Colours use `light-dark()`, so the app follows the OS colour scheme. The canvas section points React Flow's CSS variables at these tokens, styles CodeMirror through `.canvas-code`, and draws the running-node pulse through `.canvas-node-running`. `styles.css` also defines a `canvas-grid` utility that nothing uses.
- **Layout**: the sidebar shows icons only below 1024 px (`components/layout/app-shell.tsx`). The Build grid has no fixed height: it takes the height left by the page header and the run console (`xl:min-h-0 xl:flex-1` in `build-tab.tsx`).

## 10. Conventions

Plan section 4 and `CLAUDE.md`.

- TypeScript strict, `noUncheckedIndexedAccess`, no `any`. `verbatimModuleSyntax`: use `import type` for type-only imports. `erasableSyntaxOnly`: no `enum` and no constructor parameter properties.
- Relative imports use the real extension: `'./app.ts'`, `'../components/ui/badge.tsx'`.
- Validate every boundary (HTTP bodies, DB JSON columns, model output) with the shared zod schemas. Never redefine SDK types.
- Server routes parse input (bodies through `routes/read-json.ts`), call a `db/` module (or `engine/executor.ts` to start or cancel a run, `engine/approvals.ts` to decide an approval) and return the result. Business rules live in `db/`, except the cancel guard (`engine/executor.ts`) and the approval guards (`engine/approvals.ts`). Error classes live in `apps/server/src/errors.ts`. HTTP status mapping lives in `app.ts`.
- Web: `fetch` happens only in `api/*.ts`, through `request()` exported from `api/client.ts`. Pages compose features. Features own their hooks and components.
- Files at most 300 lines (a guideline). Over it today: `engine/executor.test.ts` (376). Kebab-case names. Named exports. Co-located `*.test.ts`; the plan requires tests for the engine, checks, scorers and health.
- Comments only where the why is not obvious.
- Biome formats: 2 spaces, width 100, single quotes, no semicolons, sorted imports.
- Before using zod 4, Hono 4, react-router 8, `@xyflow/react` 12, Tailwind 4, radix-ui, Vite 8 or Vitest 5, check the current API with the Context7 tools.

## 11. Recipes

**Add an API route**

1. `packages/shared/src/api.ts` or `api/runs.ts`: the request and response schemas and the path helper. Orchestrator change; a wave proposes it.
2. `apps/server/src/db/<area>.ts`: the rules and SQL, through the `sqlite.ts` helpers. Throw `NotFoundError`, `ConflictError` or `InvalidDefinitionError` for known failures.
3. `apps/server/src/routes/<area>.ts`: a Hono sub-app that parses the body with the shared schema and returns the `db/` result, as `routes/agents.ts` does. A route that starts or decides runs takes the engine deps, as `routes/runs.ts` does.
4. `apps/server/src/app.ts`: `app.route('/api/<area>', <area>Routes(db))`, or `<area>Routes(engine)` for a route that takes the engine deps. Add any new error class to `onError`.
5. `routes/<area>.test.ts`: `openDb(':memory:')`, `migrate`, `createApp`, `app.request`.
6. `apps/web/src/api/client.ts`: a fetch function that parses the response with the schema, and a hook.
7. Update this file.

**Add a node kind**

1. `packages/shared/src/schema/agent.ts` (orchestrator): add the schema to the `Node` union and to `NODE_TYPES`. The palette reads `NODE_TYPES`. Add graph rules to `validateDefinition` if its edges need them.
2. `apps/web/src/features/canvas/node-info.ts`: add the entry to `NODE_INFO`. Its type is `Record<NodeType, …>`, so TypeScript fails until you do.
3. `apps/server/src/engine/nodes/<kind>.ts`: the handler, with a co-located test. Add a `case` to the switch in `nodes/index.ts`; TypeScript fails until the switch covers the kind.
4. `apps/web/src/features/canvas/nodes/`: the card component (built on `node-card.tsx`), and register it in `node-types.ts`. TypeScript does not check that registry, so a kind missing from it will not render on the canvas. Then:
   - `definition-graph.ts`: a case in `createNode`.
   - `node-forms/<kind>-form.tsx`, and a case in `node-inspector.tsx`.
   - `nodes/node-summary.ts`: a case in `nodeSummary`.

**Add a check kind**

1. `packages/shared/src/schema/agent.ts` (orchestrator): add a variant to `CheckConfig`, discriminated by `kind`.
2. `apps/server/src/engine/checks.ts`: a case in `runCheck` that returns `{ pass, reason }`, with a test in `checks.test.ts`. TypeScript fails until the switch covers the kind.
3. `apps/web/src/features/canvas/node-forms/check-form.tsx`: add the kind to `KIND_OPTIONS`, to the `KindValue` list and to `defaultCheck`. TypeScript checks `defaultCheck` for completeness; the other two are plain lists, so a kind missing from them cannot be picked.
4. `node-forms/check-fields.tsx`: a case for the kind's fields. `nodes/node-summary.ts`: a case in `checkSummary`.

**Add a built-in tool**

1. `apps/server/src/engine/tools/builtin.ts`: a `ToolDef` with `connectionId: BUILTIN_CONNECTION_ID`, a name, a description, a JSON Schema input in the same form as `http_request` (every property in `required`, and `additionalProperties: false`), and a `run(input, signal, ctx)` that validates its input with zod. Add it to `builtinTools`. Tools that need the run or its agent read `ctx` (`memory_save` is the example).
2. `apps/server/src/seed.ts`: add the name to `BUILTIN_TOOLS`, so a new database enables it. An existing database keeps its enabled list, so turn the tool on in the Connections page (the built-in card has a switch per tool).
3. No web change. The tool picker reads `GET /api/connections`, so the tool appears under Built-in once it is enabled. The AI step's list of tools is not in the web code any more.
4. A test next to it, in `builtin.test.ts` (section 12).

**Add an MCP server**

No code change for a server that speaks stdio or streamable HTTP.

1. On the Connections page, click Add MCP server: give a name, then an HTTP URL, or a command with arguments and `KEY=value` environment lines. Or call `POST /api/connections` with `{ name, config }` (`config` is an `McpConfig`, section 7).
2. The server is listed before it is saved. An unreachable server shows its error, and nothing is saved.
3. Turn on the tools it should offer, with the switches on its card. An enabled tool shows in the AI step's tool picker under the server's name.
4. After the server adds or removes tools, use Refresh on its card (or edit its config).
5. A new transport needs a change to `McpConfig` in `packages/shared` (orchestrator) and to `transportFor` in `engine/tools/mcp.ts`. Tests use `engine/tools/fake-mcp.ts` for the registry and the routes; `mcp.test.ts` covers only failures that happen before any request.

**Add a scorer**

1. `packages/shared/src/schema/eval.ts` (orchestrator): add a variant to `Scorer`.
2. `apps/server/src/evals/scorers.ts`: add a case to `score`, with a test in `scorers.test.ts`.
3. `apps/web/src/features/evals/scorer-builder.ts`: add the kind to `SCORER_KINDS`, `SCORER_FIELD` and `candidateFor`. The editor (`scorer-editor.tsx`) reads these lists. `scorerChipLabel` has a `switch` for the chip text in the same file, so add a case there too.
4. `apps/server/src/evals/scorers.test.ts`: a case for the new kind, pass and fail. Nothing else checks that `score` handles it.

**Add a trigger kind** (a new way to start a run; `TriggerConfig` is the discriminated union)

1. `packages/shared/src/schema/run.ts` (orchestrator): add the variant to `TriggerConfig`, and to `TriggerKind` if runs record it. `packages/shared/src/api/triggers.ts`: add it to `CreateTriggerBody`. Propose both as a contract change.
2. `apps/server/src/db/triggers.ts`: check the config when it is created or updated (as `scheduleProblem` does for schedules), and generate any secret in `createTrigger`. `toView` sets `webhookUrl`, so extend it if the new kind has a URL.
3. Starting runs. A time-based kind registers its jobs in `scheduler.ts` (`registerJobs` skips any kind it does not handle). An inbound kind gets a route, as `routes/hooks.ts` does. Both call `startRun` with the new `triggerKind`, after `scheduleSkipReason` or `resolveWebhook`.
4. `apps/server/src/routes/triggers.ts`: no change if `CreateTriggerBody` covers the kind. Every write already calls `scheduler.reload()`.
5. `apps/web/src/features/triggers/`: add the option to the Type select in `trigger-dialog.tsx`, with its form. `trigger-list.tsx` and `summarizeTriggers` in `schedule.ts` use ternaries on `config.kind`, which TypeScript does not check for a new kind, so add a branch to each.
6. Tests next to each file changed: `db/triggers.test.ts`, `scheduler.test.ts` or `routes/hooks.test.ts`, and `schedule.test.ts` for the pure helpers.
7. Update this file: sections 4, 6, 7 and 8.

**Add a UI page**

1. `apps/web/src/pages/<name>.tsx`: a named export that renders `PageHeader` and feature components.
2. `apps/web/src/app.tsx`: add `{ path: '<name>', Component: <Name>Page }` to the layout's children.
3. `apps/web/src/components/layout/app-shell.tsx`: add a `NAV` entry if the page is top level.
4. `apps/web/src/api/client.ts`: a query function and hook for its data.
5. Feature code in `apps/web/src/features/<area>/`.
6. Check it in the browser: loading, empty, error, and narrow widths.

**Change the database schema**

Add `apps/server/src/db/migrations/00N_<name>.sql`. Do not edit an applied migration. Update section 6.

## 12. Validation and tests

- `npm run check` runs, in order: `biome check .`; `npm run typecheck --workspaces` (`tsc -p` in `packages/shared`, `apps/server` and `apps/web`); `npm run test --workspaces` (`vitest run` in each). It must exit 0 before you report.
- Biome checks the whole repo except `dist`, `node_modules` and `data` (the exclusions in `biome.json`). At the last run (2026-10-14) it checked 252 files with no findings.
- Tests, 250 in 41 files, by file (from a JSON run of each workspace on 2026-10-14). `apps/web/e2e/smoke.spec.ts` is not a Vitest file and is not counted:

  | Workspace | File | Tests |
  |---|---|---|
  | shared | `src/schema/agent.test.ts` | 6 |
  | server | `src/db/connections.test.ts` | 7 |
  | server | `src/db/insights.test.ts` | 6 |
  | server | `src/db/memories.test.ts` | 7 |
  | server | `src/db/sqlite.test.ts` | 1 |
  | server | `src/db/triggers.test.ts` | 8 |
  | server | `src/draft.test.ts` | 9 |
  | server | `src/engine/checks.test.ts` | 9 |
  | server | `src/engine/executor.test.ts` | 11 |
  | server | `src/engine/health.test.ts` | 6 |
  | server | `src/engine/json-schema.test.ts` | 9 |
  | server | `src/engine/llm.test.ts` | 3 |
  | server | `src/engine/nodes/ai.test.ts` | 6 |
  | server | `src/engine/nodes/approval.test.ts` | 2 |
  | server | `src/engine/sandbox.test.ts` | 6 |
  | server | `src/engine/template.test.ts` | 4 |
  | server | `src/engine/tools/builtin.test.ts` | 2 |
  | server | `src/engine/tools/mcp-run.test.ts` | 1 |
  | server | `src/engine/tools/mcp.test.ts` | 4 |
  | server | `src/engine/tools/registry.test.ts` | 11 |
  | server | `src/evals/runner.test.ts` | 4 |
  | server | `src/evals/scorers.test.ts` | 17 |
  | server | `src/routes/agents.test.ts` | 4 |
  | server | `src/routes/approvals.test.ts` | 10 |
  | server | `src/routes/connections.test.ts` | 7 |
  | server | `src/routes/draft.test.ts` | 6 |
  | server | `src/routes/evals.test.ts` | 6 |
  | server | `src/routes/hooks.test.ts` | 4 |
  | server | `src/routes/insights.test.ts` | 5 |
  | server | `src/routes/memories.test.ts` | 3 |
  | server | `src/routes/runs.test.ts` | 4 |
  | server | `src/routes/triggers.test.ts` | 4 |
  | server | `src/scheduler.test.ts` | 4 |
  | server | `src/seed.test.ts` | 1 |
  | server | `src/templates.test.ts` | 3 |
  | web | `src/features/canvas/definition-graph.test.ts` | 15 |
  | web | `src/features/connections/server-config.test.ts` | 8 |
  | web | `src/features/evals/scorer-builder.test.ts` | 5 |
  | web | `src/features/runs/run-format.test.ts` | 5 |
  | web | `src/features/triggers/schedule.test.ts` | 13 |
  | web | `src/lib/format.test.ts` | 4 |

  Totals: shared 6 in 1 file; server 194 in 34 files; web 50 in 6 files. The server tests cover the executor's walk, cancel (during a model call and during a tool call), resume after approval, queued-cancel and boot recovery; the approval routes (approve, reject, double decision, unknown and cross-run ids, cancel expiring an approval, the timeout); the run routes (start, the no-version refusal, SSE replay after the run ends, 404); each check kind; the JSON Schema subset; the sandbox; templates; the LLM wrapper (cost and the missing-key path); the AI step's tool loop; the seed; the database helpers; the trigger rules, the scheduler (jobs, skipped runs, approval timeouts); the webhook route (secret, paused, no version); the eval runner and scorers and their routes; the insights queries and health scores; and the draft (the model call through a fake, the repair round, the 502 and the missing-key path).

- Not covered by tests: `http_request` and `now` have no direct test (`ai.test.ts` sends `now` through a fake model). The MCP client is tested only where it fails before any request. The live stdio and HTTP transports and the reconnect after a lost connection have no test: they need a live server. `db/runs.ts`, `db/approvals.ts` and `db/agents.ts` are covered through the routes. The live part of the SSE stream has no test (the tests cover replay only). The real model calls are not tested: every test uses a fake `Llm` or a fake draft call, and the live draft check in section 13 is manual. On the web side, the tests cover pure modules only (`definition-graph.ts`, `run-format.ts`, `lib/format.ts`, `schedule.ts`, `scorer-builder.ts`, `server-config.ts`). `api/client.ts`, `api/sse.ts`, the connections and memory hooks, the active-run store and all components have no tests.
- **End-to-end smoke test (not part of `npm run check`).** `apps/web/e2e/smoke.spec.ts` (Playwright, Chromium) does one run of the main flow: it creates an agent from the "Support email triage" template, sets the model to Claude Haiku 5.5, publishes, runs with the approval approved, creates a dataset with one case and runs the evals, then deletes the agent. Run it with `npm run e2e -w apps/web`. It starts `npm run dev` unless one is already on port 5173. It needs:
  - `ANTHROPIC_API_KEY` in `.env`. The run makes real calls to `claude-haiku-5-5`, a small cost.
  - A Chromium build for Playwright, once: `npx playwright install chromium`.
  - `@playwright/test` (`^1.64.1`, a dev dependency of `apps/web`, so `npm install` brings it in).

  The smoke test is written. It was not run for this update, so no result is recorded here. The web app has no DOM test library, so UI changes are checked in the browser (`npm run dev`, then http://localhost:5173).
- Server tests print Node's SQLite ExperimentalWarning. That is expected.
- `npm run build` writes `apps/web/dist`. The API serves that folder on :8787 if it existed when the API started, so restart the API after a first build.
- **Live API check (2026-10-13).** Run on a scratch database outside the repo, on port 8799, with `ANTHROPIC_API_KEY` set empty in the environment and no agent that calls a model (the seeded agent was not run), using `PORT=8799 DB_PATH=<scratch file> npm run start -w apps/server`. It checked:
  - Agents: create (201, draft, no version), publish (201, number 1, agent active), an invalid draft (400 `invalid definition` with its details), an empty name and a bad status (400 `validation`), delete (204, then 404).
  - Runs: start (201, `queued`); a code-only run that succeeds with the template output and an event sequence numbered 1 to n; a regex check that routes a card-like input to the fail edge and a clean input to the pass edge, with the match text in the check result; a run of an unpublished agent (400 `Publish a version first`).
  - Approvals: a waiting run listed in the queue with the agent name and the rendered message; reject with a note (`failed`, `Rejected by reviewer: <note>`); deciding twice (409); an unknown approval id and another run's approval (404); cancel while waiting (`cancelled`, the approval `expired`, the run leaves the queue); approve after cancel (409).
  - SSE: replay of a waiting run; one `: keep-alive` after 15 s; a live stream across an approve, with unique ids, the approval events and the code step, ending with `event: done` (status `succeeded`).
  - Restart: a waiting approval survives it and can be approved; approve returns `running` and the run then succeeds with its output; a run marked `running` and one marked `queued` in the database were failed at boot with `interrupted by restart`, each with a `run_end`; the seed did not run again.
  - Errors: 400 `validation` for a body with no `input` key, 400 `invalid JSON`, 404 for an unknown agent, version, run, approval and an unknown `/api` path (`{ error: 'not found' }`), and 409 for a decided approval.
  - Not exercised: any model call (AI steps, the judge, the seeded agent), the 409 `run is not waiting for approval` guard, and the 500 path. The browser UI was not opened in this update.
- **Wave 2 live checks.** No live model call (draft, judge or eval) is recorded in this file. Wave 2 is covered by fake-model tests (the draft, the judge through a fake `Llm`, the eval runner). The scheduler, the webhook and the approval timeout have route and unit tests, but no live run of a schedule firing or a webhook call against a running server is recorded.

## 13. Roadmap (plan section 5)

| When | Who and what | Status |
|---|---|---|
| Day 1 | Orchestrator: scaffold, shared contract, SQLite and migration 001, agents CRUD and versions, web shell, seeded agent, docs, `git init`. | Done. |
| Days 2–4 | Wave 1: **A** engine (executor; AI, Code, Branch and Output nodes; `llm.ts`; manual run API; SSE; tests). **B** canvas (React Flow editor, palette, custom nodes, inspector forms, autosave, Publish). **C** runs UI (console drawer, live nodes, run list and detail, approvals). **D** checks and approvals (`checks.ts`, Approval pause and resume). | Done. Integrated, and the API checks in section 12 pass. Model paths are not verified live (section 14). |
| Day 4 pm | Orchestrator: integrate wave 1; demo steps 1, 3, 4. | Integrated. Steps 1 and 3 need no key. Step 4 on the seeded agent needs `ANTHROPIC_API_KEY`, because its first step is an AI step. |
| Days 5–7 | Wave 2: **E** evals (scorers, runner, routes, UI). **F** triggers (table, schedule UI, croner, webhook and API endpoints). **G** describe to draft, the New-agent flow, three templates. **H** insights and health (SQL aggregates, health ring). | Done. Integrated, then reviewed in a fix pass. No live model check (draft, judge or eval) is recorded (section 14). |
| Day 7 pm | Orchestrator: integrate wave 2; demo steps 2, 5, 6, 7. | Integrated in the fix pass. |
| Days 8–9 | Wave 3: **I** connections (built-in tools, MCP client, Memory tab). **J** polish (empty, loading and error states, keyboard, responsive). **K** QA (review, simplify, Playwright smoke test). | Done. Built: I1 to I3 (connections, MCP client, memory, the Memory tab, the tool picker), the J1 layout fix, the K1 simplify pass, and the review round. The smoke test (section 12) is written but was not run for this update. No live model or MCP check is recorded (section 14). |
| Day 10 | Orchestrator: final docs, demo script, tag `v0.1.0`. | Done 2026-10-14. The README demo script (steps 1 to 8) was run from a clean clone on Haiku, and the e2e smoke passed there. The only fix needed was declaring `@playwright/test` in `apps/web/package.json`. Tagged `v0.1.0`. |

Stretch goals, only if a wave finishes early (plan section 5): consultant (sub-agent) node, version diff view, Slack trigger. Out of scope for sprint 1 (plan section 1): auth and multi-tenancy, screen or voice recording, browser automation, connector marketplace, Slack, Teams and WhatsApp triggers, parallel fan-out, cloud deploy.

## 14. Known limits (after wave 3)

- **Model paths are not verified live.** AI steps, the LLM judge, the describe-to-draft call, the eval runs and the seeded agent's AI step have not been run against the live API. Tests use a fake `Llm`. The `llm_judge` verdict and the price table (section 8) are unchecked live.
- **Approval timeouts are enforced once a minute.** The scheduler's housekeeping job calls `expireTimedOut`, which runs `timeOutApproval` (in `engine/approvals.ts`). The timeout follows `onTimeout`: reject or approve.
- **MCP servers are not checked live.** The client tests use configs that fail before any request, and the registry and routes use a fake client (`engine/tools/fake-mcp.ts`). No live MCP server listing or call is recorded in this file.
- **MCP schemas are sent as the server gives them.** They are not strict and not checked here. A schema the API rejects fails the AI step with `Anthropic rejected the request`.
- **Stdio servers may outlive the API.** Nothing calls the registry's `close()` at shutdown.
- **Anyone who can reach the API can start a local command.** Adding a stdio connection runs its command on this machine, as the API's user, to list its tools. The API has no auth (section 1).
- **MCP env values are stored and returned in plain text.** A stdio connection's `env` is saved in `connections.config_json` and returned by `GET /api/connections`. Values are neither encrypted nor masked, and the API has no auth, so anyone who can reach it can read them. Keep the database file private, and avoid secrets in `env` until this changes.
- **MCP clients live in the API process.** Each HTTP session and each stdio child belongs to it. A restart drops them, and each server is listed again on its next use. A run that starts before its listing ends fails its AI step with `Unknown tool` (section 4).
- **Built-in tools ignore the enabled list at run time.** The picker shows only the enabled built-in tools, but `registry.resolve` does not check `enabledTools` for them. A step that still names a switched-off built-in tool keeps it.
- **Memory search is a LIKE scan.** `memory_search` uses SQL `LIKE`: case folding covers ASCII letters only, and there is no index. Its cost has not been measured beyond a few facts per agent.
- **Only the newest 20 facts reach the model.** Older facts are kept, and `memory_search` can find them, but the AI step's facts block never includes them.
- **Eval runs share memory.** A memory tool call in an eval run writes to the agent's facts.
- **A changed server is seen only after a refresh.** Tools that the server adds or removes are not listed until Refresh (or a config change) lists it again.
- **An enabled tool that the server no longer lists fails the step.** The picker shows it as unavailable, and a run that uses it fails with `Unknown tool`.
- **JSON Schema subset.** `json-schema.ts` checks the keywords listed in the header comment of `engine/json-schema.ts` and ignores every other keyword without an error. A `json_schema` check that uses `anyOf`, `oneOf`, `allOf`, `$ref`, `format`, `minItems`, `maxItems`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` or `uniqueItems` passes on those keywords whatever the value. `additionalProperties` is enforced only when it is `false`; a schema value is ignored. `pattern` is compiled without flags.
- **Bad patterns fail the run.** An invalid regex or invalid flags in a regex check, or an invalid `pattern` in a schema, throws, and the run fails with the error text. The check config does not validate its flags when saved.
- **A new regex check fails every run until edited.** `createNode` gives a new check an empty pattern in `block` mode. An empty pattern matches any value, so the check fails and the run stops until its pattern is set. The draft still saves, because an empty pattern passes the schema.
- **Check reasons show matched text.** A check's reason names the matched text, for example `Matched "4111 …"`. That text is stored in `run_events`. The run input is already stored verbatim in `runs.input_json`, so this adds no new exposure. A redacted reason would be a deliberate change.
- **`cost_cap` counts only the spend so far.** It compares the spend at its place in the graph. Spend after the check is not counted.
- **Opus fallback is not sent.** Plan section 3 asks for `fallbacks: "default"` with the beta `server-side-fallback-2026-07-01` on Opus 5.5 calls. It is not implemented, so an Opus refusal fails the step instead of being retried server-side. To add it, send the parameter in `message()` in `llm.ts` for `claude-opus-5-5` only (never Haiku), and map the beta response type inside `llm.ts`. It needs a live key to verify.
- **Cancelled approval steps have no end event.** A run cancelled while it waits gets no `node_end` for its approval node, so its timeline group has no duration (confirmed in the live check).
- **Built-in tool schemas are unverified live.** The `http_request` schema was changed to fit the strict-tool rules (no `headers`, `body` required and nullable). It has not been checked against the live API. The whole response is read before it is cut to 50 KB.
- **Built-in tools are listed twice.** `engine/tools/builtin.ts` and the seed's `BUILTIN_TOOLS` list (which enables them in a new database) must both change for a new tool. The picker reads the tools from the connections API, so it needs no change.
- **Agent-level tools are not editable.** `definition.tools` is the fallback for AI steps that list no tools. The UI edits only each AI step's own tools.
- **Run console labels can come from another version.** The console labels steps from the agent's current version, and the run page labels them from the run's version. After a publish during a run, the two can differ.
- **No concurrency limit.** Any number of runs can execute at once in the same process.
- **Unused contract entries.** The `skipped` node status and the `api` trigger kind are in the contract and never written. The `log` event kind is written only by an eval run's approval auto-pass.
- **Seeded card check target.** The seeded card check reads the customer's input (`target: input`). The seed runs only on an empty database, so a database created before this change keeps the old check on the AI reply (`target: output`) until the check is edited on the canvas or the database is recreated.
- **Layout at 1440 × 900.** The drawer takes its own height (`max(280px, 40vh)`), which is meant to stop it covering the canvas nodes. The canvas `fitView` check at this size is still open.
- **`node:vm` is not a security boundary.** Code and Branch steps are for the user's own code.
- **File size.** `engine/executor.test.ts` (376 lines) is over the 300-line guideline. Not split yet.
- **Bundle size.** The production JS bundle is about 1.4 MB before compression (React Flow and CodeMirror). Nothing is code-split yet.
- **The scheduler lives in the API process.** Schedules and the approval timeout check run in the one Node process with the API. A firing that falls while the server is down is not run, and nothing catches it up. A slow run can overlap the next firing. There is no concurrency limit. A hosted or multi-process setup would need a real queue, which is not in sprint 1.
- **A schedule or webhook runs the current version.** Neither stores a version, so publishing a new version changes what the next firing runs.
- **Webhook URLs are bearer secrets.** The secret is in the URL, with no signature, rate limit or IP filter. Anyone with the URL can start runs and spend model money. Every `GET /api/agents/:id/triggers` returns the URL, and the API has no auth (section 1). To replace a secret, delete the trigger and create another.
- **Describe to draft is one call and one repair.** A draft still listing problems after the repair round returns 200 with `problems`, and the dialog then blocks creating it. The model's JSON is read from its outermost braces, so a reply with extra braces in its prose fails the parse and uses the repair round. Every AI step gets the dialog's model. The draft is unchecked live.
- **Templates are fixed.** The three templates are code in `templates.ts`. The UI cannot edit or add one.
- **Eval runs cost real money and test little of the approval step.** Each case is a live run. There is no cost cap per dataset. An approval passes by itself in an eval run, so the approval step is not tested. A case run cancelled after 5 minutes fails. A restart fails the eval run.
- **Eval scorers are simple.** `llm_judge` returns pass or fail only, so `threshold` is stored and unused. The `json_schema` scorer uses the same validator and subset as the `json_schema` check (see the JSON Schema subset item).
- **Insights rules are simple.** Needs attention: success rate under 80%, or handed to a person in more than half of the window's runs. Going well: five or more runs and none failed. "Success rate" counts cancelled and waiting runs in the denominator. The spend chart overlays the previous window as a dashed line, matched by position (day 1 against day 1), not by weekday.
- **Health and Insights count differently.** Health uses the finished runs of the last 7 days, by `finished_at`. Insights uses every non-eval run in the window, by `created_at`, and its "Handed to a person" tile counts runs with an approval request in the window.
