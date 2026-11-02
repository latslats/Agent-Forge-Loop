# Sprint 1 — build plan

Name: **Agent Forge Loop**. A local-first, canvas-first app to create, run, check, evaluate and monitor AI agents.

Sprint: 10 working days. Goal: a shippable, graphical v0.1 that a person can open, build an agent on a canvas, run it, gate it with checks and approvals, evaluate it against a dataset, and watch it in Insights.

## 1. What we ship (definition of done)

The demo script below must work end to end, from a clean clone, on day 10:

1. `cp .env.example .env` → add `ANTHROPIC_API_KEY` → `npm install` → `npm run dev` → the app opens with one seeded example agent.
2. **New agent → Describe**: type "Triage inbound support emails: classify, draft a reply, block if it contains card numbers, ask a human before sending" → the model drafts the graph (AI step → PII check → Approval → Output) on the canvas.
3. **Edit on the canvas**: change the prompt in the inspector, drag in a Code step, connect it, click **Publish** → v1.
4. **Run** from the console drawer with a sample input → nodes light up as they execute, the trace streams live, the Approval node pauses the run → **Approve** → run finishes with tokens and cost shown.
5. **Triggers**: add a schedule (every 30 min) and a webhook; `curl` the webhook → a run appears.
6. **Evals**: add 5 cases, run them against v1; edit the prompt → publish v2; run again → compare pass rate, cost and latency side by side.
7. **Insights**: tiles (runs, success rate, handed to a person, errors, spend), per-agent table, spend by model; the agent's health ring shows Adherence / Autonomy / Efficiency.
8. `npm run check` (lint + typecheck + tests) is green; `README.md` and `ARCHITECTURE.md` exist and are current.

### Not in this sprint (backlog)
Auth and multi-tenant · screen/voice recording · browser automation (Playwright) · connector marketplace · Slack/Teams/WhatsApp triggers · sub-agent ("consultant") nodes · parallel fan-out in the graph · version diff view · cloud deploy.

## 2. Product: screens

Canvas-first: the canvas is the editor. Three columns, with the canvas in the center.

```
┌──────────┬────────────────────────────────────────────────┬──────────────────────────┐
│ Agents   │ ← Agents · Support triage · ● Active · v2 ·    │ Inspector                │
│ Runs     │   ⏱ every 30 min · ◎ health 84 · [Run] [Publish]│ (selected node)          │
│ Evals    │ ──────────────────────────────────────────────  │  Prompt / Code / Check   │
│ Connect. │ Build · Runs · Evals · Insights                 │  config, model, tools    │
│ Insights │ ┌ palette ┐  ┌──────── canvas (React Flow) ───┐ │ (nothing selected)       │
│          │ │ AI step │  │ Trigger → AI → Check → Approval│ │  Agent: description,     │
│          │ │ Code    │  │              ↘ fail → Output   │ │  model, principles,      │
│          │ │ Check   │  └────────────────────────────────┘ │  memory, tools, trigger  │
│          │ │ Approval│  ▼ Run console (drawer)              │                          │
│          │ │ Branch  │  input ▸ Run │ live events · $0.0031 │                          │
└──────────┴────────────────────────────────────────────────┴──────────────────────────┘
```

| Screen | Contents |
|---|---|
| **Agents** (home) | Cards: name, status, version, trigger, health ring, last run. "New agent" → Describe (text → drafted graph) or Blank or Template (3 seeded). |
| **Agent · Build** | Palette · canvas · inspector · run-console drawer. Node types: Trigger, AI step, Code step, Check, Approval, Branch, Output. Unsaved edits = draft; **Publish** snapshots a numbered version. |
| **Agent · Runs** | Run list (status, trigger, cost, duration) → run detail: step-by-step timeline, per-step trace (model calls with tokens, tool calls and results, check results), pending approval with Approve / Reject, "Run again". |
| **Agent · Evals** | Dataset of cases (input, expected, expected tools, tags) · "Run on vN" · results table (per case: pass/fail per scorer, cost, latency) · Compare two eval runs. |
| **Agent · Insights** | Runs per day, success %, cost per run, health trend (7 d). |
| **Runs** (global) | All runs + "Needs approval" queue. |
| **Connections** | Built-in tools (toggle per agent) and MCP servers (HTTP / stdio): add, list tools, enable per tool. |
| **Insights** (global) | KPI tiles vs previous window with sparklines: Runs · Success rate · Handed to a person · Runs with errors · Spend. "Needs attention / Going well" list. Per-agent table. Spend by day and by model. |

## 3. Architecture

### Stack (minimal, current versions verified 2026-10-12)
| Layer | Choice | Why |
|---|---|---|
| Runtime | Node 24, `node:sqlite` (built-in) | Zero native deps; one file DB. Wrapped in `db/sqlite.ts` so swapping to `better-sqlite3` is a one-file change if the experimental API bites. |
| Server | Hono 4 + `@hono/node-server`, SSE via `streamSSE` | Tiny, typed, streams. Serves the built web app in prod (single process). |
| Contracts | zod 4 in `packages/shared` | One source of truth for types, validation, and JSON Schema (`z.toJSONSchema`) for tool inputs and structured outputs. |
| LLM | `@anthropic-ai/sdk` 0.133 | Messages API, streaming, tool use, structured outputs, prompt caching. |
| Scheduler | croner 10 | Cron in-process, zero deps. |
| Web | Vite 8 · React 19 · react-router · TanStack Query 5 · `@xyflow/react` 12 · Tailwind 4 · `radix-ui` primitives · `@uiw/react-codemirror` (markdown / JSON / JS editing) · recharts 3 | Standard, well-documented, nothing exotic. |
| Quality | Biome 2 (lint + format) · Vitest 5 · tsc | One `npm run check`. |

### Repository layout (npm workspaces)
```
package.json  biome.json  tsconfig.base.json  .env.example  README.md  ARCHITECTURE.md
docs/            sprint-1-plan.md, sprint-2-plan.md
packages/shared/src/
  schema/agent.ts      AgentDefinition, nodes, edges, checks (zod)
  schema/run.ts        Run, RunEvent, Approval
  schema/eval.ts       Dataset, Case, Scorer, EvalRun, EvalResult
  api.ts               route request/response contracts
apps/server/src/
  index.ts             Hono app, static files, boot scheduler
  db/sqlite.ts         open, migrate, typed query helpers        db/migrations/001_init.sql
  routes/              agents.ts runs.ts evals.ts triggers.ts connections.ts insights.ts
  engine/executor.ts   walks the graph, persists events, resumable
  engine/nodes/        ai.ts code.ts check.ts approval.ts branch.ts output.ts
  engine/llm.ts        Anthropic client, model + price table, cost, caching
  engine/tools/        registry.ts builtin.ts mcp.ts
  engine/checks.ts     regex · json_schema · llm_judge · cost_cap · tool_allowlist
  engine/health.ts     Adherence / Autonomy / Efficiency from runs
  evals/               scorers.ts runner.ts
  scheduler.ts         croner jobs from the triggers table
  draft.ts             describe → AgentDefinition (structured output)
apps/web/src/
  main.tsx app.tsx     routes, providers
  api/client.ts        the only fetch layer (+ React Query hooks)
  components/ui/       Button Card Badge Dialog Tabs Select Switch Input Toast (written once)
  pages/               agents.tsx agent.tsx runs.tsx connections.tsx insights.tsx
  features/canvas/     React Flow nodes, palette, inspector forms
  features/runs/       console drawer (SSE), list, timeline, approvals
  features/evals/      datasets, cases, results, compare
  features/insights/   tiles, charts, tables
```

### Data model (SQLite, JSON columns validated by zod at the boundary)
`agents` (id, name, description, status, current_version_id, draft_json, timestamps) · `agent_versions` (id, agent_id, number, definition_json, note, created_at) · `triggers` (id, agent_id, kind manual|schedule|webhook|api, config_json, enabled) · `runs` (id, agent_id, version_id, trigger_kind, status queued|running|waiting_approval|succeeded|failed|cancelled, input_json, output_json, state_json, tokens_in, tokens_out, cost_usd, error, started_at, finished_at) · `run_events` (id, run_id, seq, ts, kind, node_id, payload_json) · `approvals` (id, run_id, node_id, status, note, requested_at, resolved_at) · `memories` (id, agent_id, content, source_run_id, created_at) · `connections` (id, kind builtin|mcp, name, config_json, enabled_tools_json) · `eval_datasets` · `eval_cases` · `eval_runs` · `eval_results`.

### The agent definition (the core contract, `packages/shared/src/schema/agent.ts`)
```ts
AgentDefinition { name, description, model, effort, principles /* markdown */,
                  memory: { enabled }, tools: ToolRef[], nodes: Node[], edges: Edge[] }
Node = Trigger | Ai { prompt, model?, tools?, maxTurns } | Code { source /* JS */ }
     | Check { kind: regex|json_schema|llm_judge|cost_cap|tool_allowlist, config, onFail: stop|route }
     | Approval { message, timeoutMinutes?, onTimeout: fail|approve } | Branch { expression } | Output { template? }
Edge { from, to, label?: pass|fail|true|false }
```

### Engine semantics
- A **run** executes one version. The executor walks from the Trigger node along edges, one node at a time (no parallel fan-out in v1). Every node appends events (`node_start`, `model_call` with usage, `tool_call`, `tool_result`, `check_result`, `approval_requested`, `node_end`, `run_end`) and saves `state_json`, so a run can resume after an approval or a restart.
- **AI step**: `messages.stream` with system = principles + memory facts (with `cache_control`), the agent's tools as strict JSON-schema tools, loop on `tool_use` until `end_turn` or `maxTurns`; handle `max_tokens` and `refusal` stop reasons. Usage × price table → `cost_usd`.
- **Code step**: JS in `node:vm` with `{ input, vars, prev }`, 2 s timeout, no `require`.
- **Check**: pure `(ctx) => { pass, reason }`; `llm_judge` uses Claude Haiku 5.5 with a structured-output verdict; `onFail: stop` fails the run, `onFail: route` follows the `fail` edge.
- **Approval**: status → `waiting_approval`; the UI's Approve / Reject resumes or fails the run; `timeoutMinutes` enforced by the scheduler.
- **Triggers**: manual (UI), `POST /api/agents/:id/runs` (API), `POST /hooks/:agentId/:secret` (webhook, body = input), schedule (croner, re-registered on boot).
- **Streaming**: `GET /api/runs/:id/events` (SSE) replays stored events then follows live ones from an in-memory bus.
- **Health** (last 7 days, per agent): Adherence = % runs without tool errors or failed checks · Autonomy = % runs that finished without an approval · Efficiency = 100 when recent median cost ≤ the agent's 30-day median, lower in proportion. The formulas are visible in the UI.

### Models and API rules (from the claude-api skill; builders read its TypeScript README before touching `engine/llm.ts`)
- Default step model **`claude-sonnet-5-5`** ($2 / $10 per MTok, cache read $0.20); per-agent and per-step override to **`claude-opus-5-5`** ($4 / $20) or **`claude-haiku-5-5`** ($0.10 / $0.50). LLM-judge checks and eval scorers use Haiku 5.5. Model ids are used exactly as written, no date suffix.
- Adaptive thinking is on by default: omit `thinking`; control depth with `output_config.effort` (Opus 5.5 defaults to `medium`, set it explicitly). No assistant prefill. No forced `tool_choice`; use `auto` + `strict: true` tools. Structured outputs through `output_config.format` (JSON Schema from zod). Streaming with `.finalMessage()`. Include `fallbacks: "default"` with beta `server-side-fallback-2026-07-01` on Opus 5.5 calls. Prompt caching on system prompt and tools; read `usage.cache_read_input_tokens` to confirm.

### Evals
Scorers: `exact`, `contains`, `json_schema`, `llm_judge` (rubric → pass/score), `tool_calls` (expected tool names were called), `latency_ms ≤`, `cost_usd ≤`. An eval run executes the chosen version on every case (concurrency 3), stores per-case scores, a case passes when every scorer passes; summary = pass rate, mean cost, p50 latency. Compare = two eval runs side by side per case.

### Describe → draft
`POST /api/agents/draft { description }` → Opus 5.5 with `output_config.format` = JSON Schema of `AgentDefinition` → validated with zod → returned unsaved; the canvas renders it; **Save** creates the agent and v1.

## 4. Conventions (enforced by review)
- TypeScript strict, no `any`; validate every boundary (HTTP, DB JSON, LLM output) with the shared zod schemas; never redefine SDK types.
- Routes stay thin: route → service → db. Web: `api/client.ts` is the only fetch layer; pages compose features; features own their hooks and components.
- Small files (guideline ≤ 300 lines), kebab-case file names, named exports, co-located `*.test.ts` for engine, checks, scorers, health.
- Comments only where the *why* is not obvious. Every structural change updates `ARCHITECTURE.md` in the same change.
- One command gates everything: `npm run check` = `biome check` + `tsc --noEmit` + `vitest run`.

## 5. Schedule and who does what

Orchestrator (this session, Claude Fable 5.1): scaffold, the shared contract, integration, review, docs. Builders: Claude Haiku 5.5 subagents, each with a workstream spec, an exclusive list of files it owns, and the rule "do not edit `packages/shared`; propose contract changes in the report". Every builder runs `npm run check` before reporting and reports files changed + how to verify.

| Day | Who | Deliverable | Verified by |
|---|---|---|---|
| 1 | Orchestrator | `git init`; workspaces; Biome/tsc/Vitest; shared schemas; SQLite wrapper + migration 001; Hono skeleton with agents CRUD + versions; web shell (nav, routes, UI kit, React Query); seeded example agent; `ARCHITECTURE.md` v0; repo `CLAUDE.md` with the conventions above | `npm run check` green; app boots and lists the seeded agent |
| 2–4 | **Wave 1 — 4 Haiku builders in parallel** | **A Engine**: executor, AI/Code/Branch/Output nodes, `llm.ts` (price table, cost, caching), manual run API, SSE events, unit tests · **B Canvas**: React Flow editor, palette, custom nodes, inspector forms, draft autosave, Publish → version · **C Runs UI**: console drawer on SSE, live node highlighting, run list/detail/timeline, approval buttons · **D Checks + approvals**: `checks.ts` (all five kinds), Approval node pause/resume, tests | Each: `npm run check`; A/D: tests; B/C: screenshots |
| 4 (pm) | Orchestrator | Integrate wave 1; the demo steps 1, 3, 4 work on the seeded agent | Manual run of steps 1, 3, 4 |
| 5–7 | **Wave 2 — 4 Haiku builders** | **E Evals**: scorers, runner, routes, UI (cases, run, results, compare) · **F Triggers**: triggers table, schedule builder UI (interval / day & time, time zone), croner scheduler, webhook + API endpoints · **G Describe → draft** + New-agent flow + 3 templates · **H Insights + health**: SQL aggregates, global and per-agent Insights, health ring + score popover | E/H: tests on scorers and health math; F: `curl` webhook creates a run |
| 7 (pm) | Orchestrator | Integrate wave 2; demo steps 2, 5, 6, 7 work | Manual run |
| 8–9 | **Wave 3 — 3 builders** | **I Connections**: built-in tools (`http_request`, `now`, `memory_save`, `memory_search`), MCP client (HTTP/stdio) with per-tool toggles, Memory tab · **J Polish** (ui-ux agent): empty/loading/error states, dark mode, keyboard, responsive · **K QA** (code-reviewer + simplifier agents, then Playwright smoke: create → run → eval) | Review findings fixed; smoke test green |
| 10 | Orchestrator | Final docs (README, ARCHITECTURE, WORKFLOW refresh), full demo script, tag `v0.1.0` | Demo script passes from a clean clone |

Stretch, only if a wave finishes early: consultant (sub-agent) node · version diff view · Slack trigger.

## 6. Risks and how they're contained
| Risk | Containment |
|---|---|
| `node:sqlite` is marked experimental | All DB access through `db/sqlite.ts`; `better-sqlite3` swap is one file. Dev script passes `--no-warnings=ExperimentalWarning`. |
| Canvas state drifting from the saved definition | The definition is the source of truth; React Flow state is derived; inspector edits write to the definition; autosave debounced 500 ms. |
| Rate limits during evals | Concurrency 3, SDK retries, per-run cost cap check. |
| Parallel builders colliding | Disjoint file ownership; shared contract frozen after day 1 and changed only by the orchestrator. |
| Scope creep | Anything outside §1 goes to the backlog list, not into the sprint. |

## 7. Decisions (made 2026-10-13)
1. Stack and scope approved as written.
2. Default step model `claude-sonnet-5-5`; Opus 5.5 and Haiku 5.5 selectable per agent and per step.
3. Name: Agent Forge Loop.
4. `ANTHROPIC_API_KEY` is available.
