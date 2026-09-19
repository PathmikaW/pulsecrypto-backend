# PulseCrypto — Backend

A Node.js/Fastify/`ws` gateway that ingests live Binance market streams for multiple trading
pairs, conflates them into a bounded-memory snapshot, and broadcasts processed updates to the
PulseCrypto mobile app over a local WebSocket server, alongside a REST metadata endpoint.

Built for the Staff Engineer / Architect (Mobile Apps) practical assignment at Amused Group.
The companion mobile client lives in a separate repository, [`pulsecrypto-mobile`](../pulsecrypto-mobile).

---

## Setup

**Prerequisites**

- Node.js 24.x (Active LTS) — enable pnpm via Corepack: `corepack enable`
- pnpm (see above)
- Docker, optional, for the containerized run path

**Install**

```bash
pnpm install
```

**Environment**

Copy `.env.example` to `.env` and adjust if needed — every default is already tuned to the
assignment's stated requirements (see [Environment variables](#environment-variables) below).
No Binance API key is required; this service only uses Binance's public market-data streams.

```bash
cp .env.example .env
```

---

## Build and run

```bash
pnpm run dev          # tsx watch — hot-reloads on change
pnpm start             # pnpm run build:ts && node dist/server.js — compiled, production-style run
pnpm run build:ts      # compile only (tsc, outputs to dist/)
pnpm test              # Vitest — unit + integration
pnpm run typecheck      # tsc --noEmit
pnpm run lint           # ESLint
```

**Docker**

```bash
docker-compose up --build
```

Multi-stage build (`node:24-alpine`, build tooling excluded from the final image), non-root
`nodejs` user, port 3000 exposed. Defaults for `BROADCAST_INTERVAL_MS`,
`EXTRA_PAIRS_COUNT`, `PAIR_RESOLUTION_TIMEOUT_MS`, and `ORDER_BOOK_PRESSURE_DEPTH` are set
in `docker-compose.yml` — override there or via `.env` as needed.

> **Not build-verified in this environment** — Docker isn't installed on the machine this was
> written on, so `docker-compose up --build` hasn't actually been run end-to-end here. The
> Dockerfile/compose setup follows the project's own ADR-X4 spec exactly and mirrors the same
> `pnpm run build:ts` / `node dist/server.js` path already verified working via `pnpm start`
> above, but please confirm the container build itself succeeds before relying on it.

Once running, the server listens on `http://localhost:3000` (REST) and the same port upgrades
to a WebSocket connection for the market-data broadcast.

**Verify it's alive**

```bash
curl http://localhost:3000/health
curl http://localhost:3000/pairs/meta
curl http://localhost:3000/metrics
```

---

## What it does

1. **Resolves the tracked pair set at startup.** The five required pairs (`BTC/USDT`,
   `ETH/USDT`, `SOL/USDT`, `DOGE/USDT`, `XRP/USDT`) are always included, unconditionally.
   Up to `EXTRA_PAIRS_COUNT` additional pairs are resolved dynamically against Binance's live
   24h quote volume — not a hand-picked list frozen at design time — filtered to exclude
   leveraged/synthetic tokens (`UP`/`DOWN`/`BULL`/`BEAR`) and stablecoin-to-stablecoin pairs. If
   Binance is unreachable or the resolution call times out (`PAIR_RESOLUTION_TIMEOUT_MS`), the
   service falls back to the required five and starts anyway — the mandatory scope is never at
   risk.
2. **Connects to Binance's combined WebSocket stream** for the resolved pair list
   (`<symbol>@depth20@100ms` + `<symbol>@ticker` per pair), continuously updating one
   in-memory state object per pair.
3. **Conflates and broadcasts on a fixed timer** (`BROADCAST_INTERVAL_MS`, default 100ms) —
   each tick snapshots the current state map and broadcasts it to every connected client. This
   bounds memory structurally: the map's size is the resolved pair count, a small fixed
   number, regardless of upstream message rate or client count.
4. **Protects against slow consumers** by checking `ws.bufferedAmount` before every write; a
   client over `MAX_BUFFERED_BYTES` is skipped for that tick (not queued — the next tick
   supersedes it), and a client skipped `MAX_CONSECUTIVE_SKIPS` times in a row is disconnected
   with close code `1013`. No per-client message history is ever retained.
5. **Serves `GET /pairs/meta`** with real data from Binance's `ticker/24hr`, filtered to the
   resolved pairs and cached 60 seconds — falling back to mock data for the required five only
   if Binance is unreachable.

---

## Architectural decisions

Full rationale for every decision below, including the options considered and rejected, lives
in [`docs/adr/`](./docs/adr) (mirrored from the project-level ADR — see
[`docs/adr/00-overview.md`](./docs/adr/00-overview.md) as the entry point). What follows is a
summary.

| Decision                  | Choice                                                                                     | Why (short form)                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTTP framework            | **Fastify**                                                                                | 2–3x Express's throughput, built-in JSON Schema validation, matters directly at a 100ms broadcast cadence where framework overhead isn't free                      |
| WebSocket library         | **`ws`**, not Socket.IO                                                                    | Direct access to `ws.bufferedAmount`, which the entire backpressure design depends on — an abstraction layer would hide exactly that signal                        |
| Pair resolution           | **Dynamic, by live 24h volume**, required five always included                             | A hardcoded "additional pairs" list goes stale the moment liquidity shifts; this stays correct against the live market, with a safe fallback                       |
| Stream processing         | **Latest-state conflation** on a fixed timer                                               | Constant, predictable memory (`O(pairs)`); naturally deduplicating; no complex delta-queue bookkeeping                                                             |
| Backpressure              | **Single mechanism**: `bufferedAmount` check + consecutive-skip eviction                   | One clear signal, one clear consequence — a second, independent safeguard (bounded queue + lag timeout) was considered and rejected as redundant                   |
| Buy/Sell Pressure, Spread | **Pure functions**, exact documented formulas                                              | Deterministic, unit-testable against fixture data, independently verifiable by hand                                                                                |
| `/pairs/meta`             | **Real Binance data**, scoped mock fallback                                                | A metadata endpoint returning fixtures under normal operation misrepresents how the system actually behaves; the fallback is honestly scoped to the mandatory five |
| Project structure         | **Hexagonal (ports & adapters)**, dependency direction enforced                            | `domain/` has zero external dependencies; adapters implement ports, never the reverse — checkable, not just a naming convention                                    |
| Observability             | **pino + prom-client**                                                                     | Structured logs explain what happened; metrics are what gets watched in real time — complementary, not substitutes                                                 |
| Security                  | **Defense in depth** (rate limiting, origin checks, non-root container, Zod-validated env) | Applied even to the parts of the system this exercise doesn't deploy — a posture that only exists for what's reviewed isn't a real posture                         |

**Buy/Sell Pressure & Spread formulas** (`domain/services/PressureCalculator.ts`):

```
Spread          = lowest_ask_price − highest_bid_price
Buy Pressure %  = (bid_volume_top_N / (bid_volume_top_N + ask_volume_top_N)) × 100
Sell Pressure % = 100 − Buy Pressure %          (complement by construction, not independently computed)
```

`N` is `ORDER_BOOK_PRESSURE_DEPTH` (default 10), deliberately decoupled from the 20-level
depth requested from Binance — the two can be retuned independently.

---

## Assumptions made

- Binance's public REST and WebSocket APIs are reachable from wherever this service runs, and
  no API key is required for the public market-data endpoints used here.
- The mobile app and this backend share a network during local development (the mobile client
  connects to a `localhost`/LAN address, not a deployed URL).
- The five required pairs satisfy the assignment's mandatory scope; additional pairs are a
  genuine bonus, not something the grading depends on.
- A production deployment would sit behind a TLS-terminating load balancer (`wss://`); local
  development intentionally runs plaintext `ws://`.

---

## Trade-offs considered

- **`ws` over Socket.IO** — full control over connection lifecycle and backpressure, at the
  cost of implementing reconnection/room-equivalent behavior manually (neither is actually
  needed server-side here).
- **Dynamic pair resolution over a hardcoded list** — always reflects real, current liquidity,
  at the cost of a startup dependency on two extra Binance REST calls (mitigated by the
  required-pairs fallback). If time were constrained, this is the one feature that could most
  safely be scoped back to "required five only" without weakening anything the assignment
  actually tests.
- **Single backpressure mechanism over layered safeguards** — a bounded per-client queue plus
  a separate lag-timeout was considered and rejected: the latest-state conflation model already
  guarantees at most one pending message per pair per client, so a second independent
  threshold would be redundant complexity, not additional protection.
- **No WebSocket heartbeat** — the 100ms broadcast cadence is itself a liveness signal; a
  separate ping/pong protocol would answer a question the data stream already answers.
- **Hexagonal architecture with explicit ports** — more structure than a three-route service
  strictly needs on its own, adopted deliberately because the assignment's evaluation criteria
  explicitly call for clean architecture and separation of concerns, not because a service this
  size would necessarily converge on it by default.

---

## How AI-assisted development tools were used

This project was built with **Claude Code** end-to-end, using a **spec-driven development**
workflow: every unit of work was implemented against a written spec in `specs/` (data models,
API contract, buffering strategy, pair-resolution strategy) rather than directly from memory
of the assignment brief, with the architecture decisions themselves recorded as a full ADR
(`docs/adr/`) before implementation began.

Concretely:

- **Architecture and design decisions** (framework choices, the backpressure mechanism, pair
  resolution strategy, hexagonal layering) were proposed, discussed, and recorded in the ADR
  before code was written — including cases where an initially-proposed pattern (e.g. a
  published shared-contracts package, a second backpressure safeguard) was reconsidered and
  simplified after review, with the reasoning for the reversal kept in the document rather than
  silently discarded.
- **Implementation** — the Fastify app, the Binance adapters, the conflation engine, the
  pressure/spread calculator, the WebSocket broadcaster with backpressure, the test suites —
  was written by Claude Code against the specs above, with every change verified directly
  (`pnpm run typecheck && pnpm run lint && pnpm test`, and an actual compile/run check) before
  being considered complete, not just asserted.
- **Git workflow**: Gitflow branching, Conventional Commits, atomic commits per logical change,
  reviewed and committed by the developer — Claude Code never pushed or merged autonomously.
- **Human review and correction**: the developer directed scope decisions (e.g. the `marketCap`
  field's placeholder-vs-real-data trade-off), caught and corrected implementation details
  across iterations, and made the final call on every trade-off recorded in this document and
  the ADR.
