# Agent Forge Loop

Agent Forge Loop is a local-first app to build, run, check, evaluate and monitor AI agents on a canvas. An agent is a graph of steps (trigger, AI, code, check, approval, branch, output) that you edit and publish as numbered versions. The API and the SQLite database run on your machine, with no account and no hosting.

## Prerequisites

- Node 24 or newer.
- An Anthropic API key in `.env` (`ANTHROPIC_API_KEY`). Runs with AI steps or LLM-judge checks need it, and so do the describe-to-draft call and evals. The rest of the app works without it.

## Quick start

```sh
cp .env.example .env    # then set ANTHROPIC_API_KEY in .env (optional for the rest of the app)
npm install
npm run dev
```

Open http://localhost:5173 (the Vite URL the terminal prints). The API listens on http://localhost:8787. On first start the app creates `data/agentforgeloop.db` and seeds one agent, "Support email triage" (version 1, on Claude Haiku 5.5).

To check that the repo is healthy, run `npm run check`. It must exit 0.

`PORT` in `.env` changes the API port, but the Vite proxy target is fixed at 8787 in `apps/web/vite.config.ts`. Change that file too, or keep the default. The proxy forwards `/api` and `/hooks` (the webhook URLs), so webhooks work through the dev server.

Schedules run inside the API process, so they only fire while `npm run dev` (or the API) is running.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API (`tsx watch`, port 8787) and the web dev server (Vite, port 5173). Ctrl-C stops both. |
| `npm run build` | Builds the web app into `apps/web/dist`. The API serves that folder if it existed when the API started, so restart the API after a first build. |
| `npm run check` | The gate: Biome lint and format for the whole repo, then typecheck and tests in every workspace. |
| `npm run fix` | Applies Biome formatting and safe fixes to the whole repo. |
| `npm run typecheck` | Runs `tsc -p` in each workspace. |
| `npm run test` | Runs `vitest run` in each workspace. |
| `npm run e2e -w apps/web` | Playwright smoke test of the main flow (see [ARCHITECTURE.md](ARCHITECTURE.md) section 12). It makes real Haiku calls, needs `ANTHROPIC_API_KEY`, and needs a Chromium build (`npx playwright install chromium`). |

## Layout

`packages/shared` zod contract · `apps/server` Hono API on `node:sqlite`, with the run engine and the MCP client · `apps/web` Vite and React UI · `docs` sprint plans · `scripts/dev.mjs` starts the API and the web app together.

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md): how the app works, from the contract to the UI, and how to extend it.
- [docs/sprint-1-plan.md](docs/sprint-1-plan.md): the approved sprint plan and definition of done.
- [CLAUDE.md](CLAUDE.md): rules for AI agents working in the repo.

## Status

Sprint 1, waves 1 to 3 are built. An agent can be drafted from a sentence or a template, built on the canvas, published, run on a schedule or by webhook, checked, gated by approvals, evaluated against a dataset, monitored in Insights, and given tools and memory. Wave 3 adds connections (the built-in tools and MCP servers over stdio or HTTP, with per-tool switches) and memory (facts an agent keeps between runs).

Sprint 1 is complete: the demo script below was run from a clean clone on 2026-10-14 and the result is tagged `v0.1.0`.

What works now:

- **New agent:** describe it in a sentence and the model drafts the steps (you review them before creating); start blank; or use one of three templates, which are published as version 1.
- **Agents:** create with a name and description (the new agent starts as trigger, AI step, output); rename; publish numbered versions; delete with confirmation.
- **Triggers:** a schedule (a cron with a time zone, built from a form) or a webhook URL that starts a run on each POST. The header shows the enabled triggers. Run in the header always works. An approval with a timeout is decided by the scheduler, which checks once a minute.
- **Evals:** datasets of cases, each with scorers (exact, contains, JSON schema, LLM judge, tool calls, latency, cost). A run scores one version and shows the pass rate, cost and latency; two runs can be compared side by side.
- **Insights:** runs, success rate, handed to a person, errors and spend over 7, 14 or 30 days, per agent and per model, with a health score (adherence, autonomy, efficiency) on each agent.
- **Build tab:** a canvas with seven step types (trigger, AI, code, check, approval, branch, output). Add a step from the palette by clicking it or dragging it onto the canvas, connect the handles, and edit each step in the inspector. Drafts autosave 500 ms after the last edit, but only while the draft has no problems. Publish saves a numbered version of the last saved draft.
- **Runs:** start a run from the run console or the API. Steps appear live over Server-Sent Events. A run can be cancelled, and its run page shows the timeline, cost and tokens. Run again repeats the input on the current version.
- **Checks:** regex, JSON schema, LLM judge, cost cap and tool allowlist. A failed check stops the run or follows its fail edge.
- **Approvals:** an approval step pauses the run. Approve or reject it from the run page, the Runs queue or the run console. A waiting approval survives a restart.
- **Connections:** the Connections page lists the built-in tools (the current time, an https request, and the two memory tools) and any MCP servers. Switch a tool on for an agent's AI step in the tool picker. Adding a server probes it first; an unreachable server is not saved.
- **Memory:** the Memory tab lists an agent's facts, with add, delete and clear. With memory on in Agent settings, the newest 20 facts go to every AI step, and AI steps can save and search facts with the memory tools.

Runs that call a model need `ANTHROPIC_API_KEY` in `.env`. Without it, AI steps, LLM-judge checks and the describe-to-draft call fail with `ANTHROPIC_API_KEY is not set (add it to .env)`, and the rest of the app still works. The seeded agent starts with an AI step, so its runs need the key. Model calls were checked live on Claude Haiku 5.5; MCP servers were checked against a scratch stdio server only. See [ARCHITECTURE.md](ARCHITECTURE.md) section 14 for this and the other known limits.

## Demo script

This is the sprint's demo ([docs/sprint-1-plan.md](docs/sprint-1-plan.md) section 1), as steps. Use Claude Haiku 5.5 for every agent you run here, to keep the cost low. Steps 2 to 4 and 6 call the model, so they need `ANTHROPIC_API_KEY`. It was run from a clean clone on 2026-10-14 (every step passed, with zero browser console errors).

1. **Start.** Run `cp .env.example .env`, set `ANTHROPIC_API_KEY` in `.env`, then `npm install` and `npm run dev`. Open http://localhost:5173. The "Support email triage" agent is in the list.
2. **Describe a new agent.** Click **New agent**, then the **Describe** tab. Type: *Triage inbound support emails: classify, draft a reply, block if it contains card numbers, ask a human before sending.* Pick Claude Haiku 5.5 as the model and click **Draft it**. The steps appear in flow order, and should be an AI step, a check on card numbers, an approval and an output. When the dialog lists no problems, click **Create agent**. The agent opens as a draft with no version yet.
3. **Edit on the canvas.** Click the AI step and change its prompt in the inspector. Add a Code step: click it in the palette, or drag it onto the canvas. Connect the step that comes before it to the Code step, then the Code step to the step that comes after it. Connecting a handle again replaces its old edge, so the chain stays valid. Wait for the status to read **Saved**, then click **Publish**. The toast reads "Published v1".
4. **Run.** Open the run console from the bar at the bottom (the header **Run** button opens it too). Type a sample input, such as *Hi, when will my order ship?*, and click **Run**. The steps light up as they run. When the run reaches the approval step, click **Approve** in the console. The run ends with **Succeeded**, and the bar shows its tokens and cost.
5. **Triggers.** Click the trigger chip in the header (it reads Manual) to open Triggers, then **Add trigger**. Choose Type **Scheduled**, set Repeat to every 30 minutes (Every 30, Unit minutes), and click **Add schedule**. Add a second trigger with Type **Webhook** and click **Create webhook**. The panel shows the full URL and a `curl` example. Run the `curl` command in a terminal (in dev, the URL works through port 5173). It answers `202` with a `runId`, and the run appears in the Runs tab. The schedule fires at its next 30-minute mark, and only while the API is running.
6. **Evals.** Open the **Evals** tab. Type *Smoke* in **New dataset name** and click **Create**. Click **Add case** five times. Each case needs a name, an input and a scorer: choose a Check (for example **Contains text** with the word to find), click **Add scorer**, then **Save case**. Click **Run evals**. Each case is a real run, so this costs model calls. Then change the prompt on the Build tab and **Publish** v2. Back on Evals, click **Run evals** again (the form defaults to the current version). Open the finished v2 run and choose **Compare with…** the v1 run to see the pass rate, cost and latency side by side.
7. **Insights.** Open **Insights** from the sidebar, or the Insights tab on the agent. The tiles show Runs, Success rate, Handed to a person, Runs with errors and Spend, each with its change from the previous window. Below them are the Needs attention and Going well lists, the Agents table, the Models table and the Spend by day chart. Eval runs are left out. The health ring in the agent header shows the overall score; its tooltip lists Adherence, Autonomy and Efficiency.
8. **Check.** Run `npm run check` in the repo root. It must exit 0.

Optional, from wave 3 (not part of the sprint demo): on the Connections page, add an MCP server or switch on a built-in tool. Then, on an AI step, pick the tool in the tool picker. Add a fact on the agent's Memory tab, turn on **Memory** in Agent settings, and run the agent again.

## Known limits

The full list is [ARCHITECTURE.md](ARCHITECTURE.md) section 14. The ones that matter most here: model calls and MCP servers have not been run against live services; MCP env values are stored and returned in plain text; the API has no auth; webhook URLs are secrets; and schedules and approval timeouts run only while the API runs.

## License

[MIT](LICENSE)
