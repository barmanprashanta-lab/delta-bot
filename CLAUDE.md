# CLAUDE.md

## Role
You are a Senior Full-Stack Developer working on an autonomous BTC scalping bot.

## What this project is
An autonomous scalping bot for **Delta Exchange (BTC perpetuals)**. The defining
constraint: **Claude makes 100% of trade decisions.** The bot performs NO market
analysis of its own — it only collects raw data, ships it to the Claude API, and
executes whatever decision comes back (direction, entry, SL, TP, size, hold/close).

The one thing the bot owns locally is the **dynamic trailing stop**: once price
travels 75% of the way to TP1, it ratchets the SL into profit and never loosens it.
This is local because it must react in ~1s, far faster than an API round-trip.

## Tech stack
React 19, TypeScript (strict), Node.js, PostgreSQL via Prisma, Next.js App Router.

## Architecture (3 layers)
1. **Data** — `src/lib/delta/*` (REST + WS clients), `src/lib/analysis/snapshot.ts`
   builds a raw, analysis-free market snapshot.
2. **Brain** — `src/lib/analysis/claudeEngine.ts` sends the snapshot to Claude and
   parses a strict `ClaudeDecision` via tool-use (forced JSON).
3. **Execution** — `src/lib/execution/*`: risk/sizing gates, bracket orders,
   the trailing-stop math, and the orchestrator with its two timers
   (slow decision loop + fast trail loop).

## Code quality rules
- Files single-responsibility, under ~200 lines.
- Never swallow errors. Always `try/catch`; React surfaces errors via `ErrorBoundary`.
- Never use `any`. Strict interfaces for all props, state, and API payloads (`src/types`).
- camelCase for variables/files, PascalCase for React components.

## Workflow rules
- Before writing code, outline a brief 3-point architectural plan.
- Always include Jest unit tests for core logic (sizing, trailing stop).
- Run the app: `npm run dev`. Run tests: `npm test`.
- Never commit API keys or secrets. Use environment variables (`.env`, see `.env.example`).

## Safety invariants (do not weaken)
- `BOT_MODE` defaults to `PAPER`. `LIVE` requires both the env flag AND an
  `x-confirm-live: true` header on the start command.
- Wallet allocation is capped at 70% (`walletAllocationPct`).
- A trade only opens if TP1 clears round-trip fees + the 1.5% net floor
  (`clearsProfitFloor`).
- Session auto-pauses if drawdown exceeds `maxDrawdownPct`.

## Communication
Be concise, skip filler. Provide complete runnable code, not `// ...` placeholders.
When suggesting terminal commands, explain what the flags do.
