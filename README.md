# Delta Scalper — Claude-driven BTC scalping bot

An autonomous scalping bot for Delta Exchange BTC perpetuals where **Claude makes
every trade decision** and the bot is a thin executor. The bot fetches raw market
data, sends it to the Claude API, and executes the returned decision (direction,
entry, stop-loss, take-profits, size, or hold/close). The bot owns one thing
locally: a **dynamic trailing stop** that locks in profit once price reaches 75%
of TP1.

## Read this before risking money

This is a real-money trading system. A few things that are true regardless of how
polished the code is:

- **An LLM is not a low-latency scalping engine.** A round-trip to the Claude API
  is seconds; scalps move in milliseconds. A decision can be stale before it
  executes. The architecture splits responsibilities accordingly — Claude sets the
  *strategy*, the local trail loop handles the *fast reaction* — but the entry
  signal itself is still latency-bound. The bot drops decisions older than 2× the
  scan interval.
- **There is no guaranteed edge.** An LLM emitting LONG/SHORT does not imply
  profitability. Treat this as a framework to test a hypothesis, not a money printer.
- **"1.5% net per scalp after fees" is a meaningful move, not a tiny one.** The bot
  refuses to open trades whose TP1 doesn't clear round-trip fees + that floor.
- **Default mode is PAPER.** Validate on paper (and ideally a separate backtest)
  before ever setting `BOT_MODE=LIVE`. Live start also requires an explicit
  confirmation header.

## Setup

```bash
npm install                 # install dependencies
cp .env.example .env        # then fill in your keys
npm run db:generate         # generate the Prisma client
npm run db:migrate          # create Postgres tables
npm test                    # run unit tests (sizing + trailing stop)
npm run dev                 # start the dashboard at http://localhost:3000
```

### Command flag notes
- `npm run db:migrate` runs `prisma migrate dev`, which creates a new migration
  from `schema.prisma` and applies it to the database in `DATABASE_URL`.
- `npm test` runs Jest against `tests/`; add `--watch` to re-run on file changes.
- `npm run typecheck` runs `tsc --noEmit` — type-checks without emitting JS.

## How it works

```
                 every scanIntervalMs (slow loop)
  ┌─────────────┐   raw snapshot    ┌──────────────┐  ClaudeDecision  ┌────────────┐
  │ Delta REST  │ ───────────────▶ │ Claude API   │ ───────────────▶ │ Executor   │
  │ + WS feeds  │                   │ (the brain)  │                  │ (the hands)│
  └─────────────┘                   └──────────────┘                  └────────────┘
        ▲                                                                    │
        │           every priceMonitorMs (fast loop, no Claude call)         │
        └────────────────  trailing-stop ratchet  ◀────────────────────────┘
```

- `src/lib/analysis/snapshot.ts` — builds the raw, analysis-free snapshot.
- `src/lib/analysis/claudeEngine.ts` — the decision engine (forced-JSON tool use).
- `src/lib/execution/risk.ts` — 70% cap, level validation, profit-floor gate.
- `src/lib/execution/trailingStop.ts` — pure, fully-tested trail math.
- `src/lib/execution/executor.ts` — bracket orders + paper simulation.
- `src/lib/execution/orchestrator.ts` — the two-timer control loop.
- `src/app/dashboard` — the live terminal UI.

## Configuration

All tuning is via environment variables — see `.env.example`. Key ones:
`BOT_MODE` (PAPER/LIVE), `BOT_SCAN_INTERVAL_MS`, `BOT_MIN_CONFIDENCE`,
`BOT_MAX_DRAWDOWN_PCT`, `BOT_MAX_LEVERAGE`.

## Disclaimer
Provided as-is for educational purposes. Trading leveraged crypto derivatives can
lose you more than your deposit. You are solely responsible for any live trading.
