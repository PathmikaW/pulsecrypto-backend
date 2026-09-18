# PulseCrypto — Architecture Decision Record

### Real-Time Cryptocurrency Market Viewer — Technical Design & Rationale

**Document type:** Architecture Decision Record (ADR)
**Version:** 8.2 — Final
**Status:** Approved for implementation

---

## Purpose of This Document

This document records the architectural decisions behind PulseCrypto ahead of implementation, in the format of a standard Architecture Decision Record: for each significant technical choice, it captures the options considered, the decision made, the rationale, and the trade-offs knowingly accepted.

The reasoning behind a decision is what makes it possible to evaluate, maintain, and safely change later — the goal is that another engineer can see not just what was built, but why, and what alternatives were weighed and rejected.

Two inputs shaped every decision below: the assignment's explicit functional and non-functional requirements, and the broader engineering expectations described in the Staff Engineer / Architect – Mobile Apps role. Where a minimal implementation and a production-grade one would diverge, this document is explicit about which was chosen and why — the target throughout was a design defensible as something that could genuinely ship, not one scoped only to satisfy a checklist. Equally, where a production-grade pattern would have introduced complexity or risk disproportionate to what it protects against in this specific context, that's stated plainly too — production-grade thinking includes knowing when *not* to add a layer, not only when to add one.

---

## Reference Materials

**UI/UX source of truth:** [Pulse Crypto Mockup — Figma](https://www.figma.com/design/JYfr5h2vC9IFKtX3vasmZk/Pulse-Crypto-Mockup?t=1Is1HymqvhvoKHab-1)

This document governs architecture, data flow, state management, and behavior. It deliberately does not prescribe pixel-level layout, spacing, color values, or component visual design — those are governed by the Figma mockup above, which is the authoritative visual reference for every screen built in Phase 4 (§6). Where the mockup and this document could plausibly conflict (for example, a visual affordance that implies a particular state the backend doesn't currently expose), the mockup describes intended UX and this document describes how to actually deliver it — flag the gap and resolve it explicitly rather than silently picking one source over the other.

**This conflict was found, not hypothetical (see ADR-M10).** The Figma file's two designed
screens ("Trading Terminal," "Telemetry & Settings") don't map one-to-one onto the
assignment's four required mobile screens — it's missing the watchlist and contains
significant content (an account-management drawer, a developer telemetry dashboard) the
assignment never asks for. Resolved explicitly, per the principle above, in ADR-M10: build
what Figma provides at full fidelity, design what it's missing (Markets/Watchlist) fresh in
the same verified visual language. Design tokens (colors, typography, spacing, radii) were
pulled from Figma's REST API, not estimated — see `pulsecrypto-mobile/specs/design-tokens.md`.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Backend Architecture Decisions](#2-backend-architecture-decisions)
3. [Mobile Architecture Decisions](#3-mobile-architecture-decisions)
4. [Cross-Cutting Decisions](#4-cross-cutting-decisions)
5. [Technology Stack Summary](#5-technology-stack-summary)
6. [Delivery Plan](#6-delivery-plan)
7. [Development Workflow — Spec-Driven Development](#7-development-workflow--spec-driven-development)
8. [Testing Strategy](#8-testing-strategy)
9. [README Content Plan](#9-readme-content-plan)
10. [Deliverables — Mapped to the Assignment Brief](#10-deliverables--mapped-to-the-assignment-brief)
11. [Final Pre-Submission Checklist](#11-final-pre-submission-checklist)
12. [Implementation Notes — Precision Details](#12-implementation-notes--precision-details)
13. [Document History](#13-document-history)

---

## 1. Executive Summary

PulseCrypto is a real-time cryptocurrency market viewer consisting of a Node.js backend that ingests and processes live Binance market data, and a React Native mobile application that visualizes it under sustained, continuous updates, built to the visual design in the Figma reference above.

The system is designed around five structural principles, each expanded into concrete decisions in the sections that follow:

- **Correctness of the required scope is never conditional.** The five mandatory trading pairs are always served, regardless of the state of any optional or dynamic feature.
- **Memory and performance bounds are structural, not tuned.** Backpressure and buffering are designed so that the failure modes the assignment calls out — unbounded memory growth under slow consumers, UI jank under sustained bursts — are prevented by the shape of the design, not by adjusting constants after the fact.
- **Architecture boundaries are enforced, not just named.** Both the backend and mobile codebases use structures where the dependency direction is explicit and checkable, consistent with the SOLID, GRASP, and Clean/Hexagonal Architecture principles the role emphasizes.
- **External facts are verified, not assumed.** Where a decision rests on a claim about the current state of a library, a company's technology choices, a third-party service's behavior, or live market data, that claim is checked against a current source rather than taken from memory — and documented with appropriate honesty, including counter-evidence where it exists. This includes the technology stack's version numbers themselves (§5), checked as of this document's date rather than assumed from training knowledge.
- **Complexity is added deliberately, in both directions.** Some decisions add structure the assignment doesn't strictly require, because the role's stated standards call for it (see ADR-B7, ADR-M2, ADR-M9). Others were initially over-built and were simplified after review, because the risk or overhead didn't match what was actually being protected against (see ADR-X1, ADR-M6). Both are the same underlying discipline applied honestly, not a bias toward adding layers.

---

## 2. Backend Architecture Decisions

### ADR-B1: HTTP Framework — Fastify

**Context.** A HTTP framework is needed for the REST surface (`/pairs/meta`, `/health`, `/metrics`).

**Options considered:**

| Option            | Pros                                                                                              | Cons                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Express           | Large ecosystem, widely familiar                                                                  | Slower, no built-in schema validation, middleware overhead                    |
| **Fastify** | 2–3x faster than Express, built-in JSON Schema validation, plugin architecture, TypeScript-first | Smaller ecosystem (not a constraint here)                                     |
| Hono              | Ultra-lightweight, edge-ready                                                                     | Less mature WebSocket integration for this use case                           |
| NestJS            | Full DI framework, strong module conventions                                                      | Heavier abstraction and slower startup than this single-service gateway needs |

**Decision.** Fastify (current stable major — see §5 for the verified version).

**Rationale.**

1. **Performance:**
   - The system runs a 100ms broadcast loop — framework overhead is not free at that cadence, and Fastify's benchmarked throughput advantage over Express matters directly here.
   - Built-in JSON Schema validation gives request/response safety by default, without a separate validation middleware layer.
2. **Structure and maintainability:**
   - Plugin architecture keeps the codebase modular without requiring a heavier DI container to get there.
   - Native TypeScript support throughout, with first-class typing for routes, schemas, and plugins.
3. **Fit for the role's stated priorities:**
   - Consistent with an emphasis on highly performant, scalable backend services and low-latency APIs — the framework choice is one of several decisions in this document made with that operating context in mind, not an isolated preference.

**Trade-offs accepted.**

- Smaller plugin ecosystem than Express — not a practical constraint for this service's surface area (three REST routes, one WebSocket integration).
- A team with only Express experience faces a short ramp-up; Fastify's API is close enough to Express's that this is minor.

---

### ADR-B2: WebSocket Library — `ws`

**Context.** A WebSocket server is needed to broadcast processed market data to connected mobile clients.

**Options considered:**

| Option                   | Pros                                                                                                         | Cons                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **ws**             | Lightweight, one of the fastest Node.js WebSocket implementations, standard-protocol, no forced abstractions | No built-in reconnection or rooms (neither needed server-side)                                        |
| Socket.IO                | Reconnection, rooms, polling fallback out of the box                                                         | Non-standard wire protocol, added overhead, obscures the exact backpressure control this system needs |
| uWebSockets.js           | Fastest available (native binding)                                                                           | Native compilation complexity, harder to debug for this scope                                         |
| Fastify WebSocket plugin | Convenient integration with Fastify                                                                          | Thin wrapper with limited additional value over using`ws` directly                                  |

**Decision.** `ws`, run alongside Fastify — Fastify serves REST, `ws` serves the WebSocket connection.

**Rationale.**

1. **Performance and control:**
   - Maximum performance for the real-time path, with no protocol translation overhead.
   - Full, direct control over connection lifecycle — specifically `ws.bufferedAmount`, which the backpressure design in ADR-B4 depends on entirely. Socket.IO's abstraction layer would hide exactly this signal.
2. **Interoperability:**
   - Standard WebSocket protocol — any compliant client can connect, not only one built against a proprietary transport layer.
3. **Scope fit:**
   - No rooms are needed, since every connected client receives the identical broadcast — a feature Socket.IO offers has no use case here.

**Trade-offs accepted.**

- Connection management — registry, backpressure, eviction — is implemented manually rather than inherited from a library. This is an intentional trade: that manual control is exactly what the assignment's backpressure requirement calls for, and delegating it to a library would remove the ability to demonstrate the design explicitly.

---

### ADR-B3: Binance Connection & Trading-Pair Resolution Strategy

**Context.** The system must stream live data for a minimum of five required pairs — BTC/USDT, ETH/USDT, SOL/USDT, DOGE/USDT, XRP/USDT — and may optionally support more. A fixed, hand-picked list of "additional" pairs would be a decision frozen at design time against a market that moves constantly: coin liquidity and listing status change, and a hardcoded guess has no mechanism to stay correct.

**Options considered — connection topology:**

| Option                           | Pros                                                              | Cons                                                             |
| -------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| One connection per pair          | Isolated failure per pair                                         | N× connection overhead, higher rate-limit exposure              |
| **Single combined stream** | One connection, Binance-recommended, simpler lifecycle management | Single point of failure (mitigated by reconnection with backoff) |
| REST polling                     | Simple                                                            | High latency, rate-limited, not genuinely real-time              |

**Options considered — how additional pairs are chosen:**

| Option                                                                        | Pros                                                                                                     | Cons                                                                                                      |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Hand-picked list, decided at design time                                      | Simple, no runtime logic                                                                                 | Goes stale the moment liquidity shifts or a pair is delisted — a guess presented as a fact               |
| **Resolved dynamically against live Binance liquidity data at startup** | Always reflects what is actually tradable and liquid right now; self-documenting; no ongoing maintenance | Slightly more startup logic; needs an explicit fallback if Binance's REST metadata is briefly unreachable |

**Decision.** A single combined WebSocket connection, carrying the five required pairs unconditionally plus a configurable number of additional pairs (`EXTRA_PAIRS_COUNT`, default 3) selected at startup by live 24-hour quote volume — never chosen in advance.

**Pair resolution logic:**

1. Query `GET /api/v3/exchangeInfo`; keep only symbols where `status = TRADING`, `quoteAsset = USDT`, and `isSpotTradingAllowed = true`.
2. Exclude leveraged/synthetic tokens (symbols ending `UP`, `DOWN`, `BULL`, `BEAR` before the `USDT` suffix) and stablecoin-to-stablecoin pairs (base assets `USDC`, `FDUSD`, `DAI`, `TUSD`, `USD1`, `PYUSD`, `USDG`) — both are technically tradable but a poor fit for a real-time price viewer: the former are index products behaving differently than spot assets, and the latter barely move in price, defeating the purpose of a live market display.
3. Query `GET /api/v3/ticker/24hr`, filter to the tradable set from steps 1–2, sort by `quoteVolume` descending.
4. Take the top `EXTRA_PAIRS_COUNT` symbols not already in the required list, and append them to it.
5. **Fallback:** if either Binance call fails or exceeds `PAIR_RESOLUTION_TIMEOUT_MS` (default 5000ms), log a warning, proceed with the required five pairs only, and let the mandatory scope of the system start correctly regardless. A background retry attempts to expand the pair set once Binance's metadata endpoints recover, without requiring a restart.

**Implementation** (in `infrastructure/binance/`, invoked once from the composition root before the ingestion adapter connects — see ADR-B7):

```typescript
// infrastructure/binance/BinancePairResolver.ts
const LEVERAGED_SUFFIX_PATTERN = /(UP|DOWN|BULL|BEAR)USDT$/;
const EXCLUDED_QUOTE_ADJACENT_BASES = new Set(['USDC', 'FDUSD', 'DAI', 'TUSD', 'USD1', 'PYUSD', 'USDG']);

export async function resolveSupportedPairs(
  requiredSymbols: string[],
  extraCount: number,
  timeoutMs: number
): Promise<string[]> {
  try {
    const [info, tickers] = await withTimeout(
      Promise.all([
        fetchJson('https://api.binance.com/api/v3/exchangeInfo'),
        fetchJson('https://api.binance.com/api/v3/ticker/24hr'),
      ]),
      timeoutMs
    );

    const tradable = new Set(
      info.symbols
        .filter((s: any) =>
          s.status === 'TRADING' &&
          s.quoteAsset === 'USDT' &&
          s.isSpotTradingAllowed &&
          !LEVERAGED_SUFFIX_PATTERN.test(s.symbol) &&
          !EXCLUDED_QUOTE_ADJACENT_BASES.has(s.baseAsset)
        )
        .map((s: any) => s.symbol)
    );

    const rankedByVolume = tickers
      .filter((t: any) => tradable.has(t.symbol))
      .sort((a: any, b: any) => Number(b.quoteVolume) - Number(a.quoteVolume))
      .map((t: any) => t.symbol);

    const extra = rankedByVolume
      .filter((s: string) => !requiredSymbols.includes(s))
      .slice(0, extraCount);

    return [...requiredSymbols, ...extra];
  } catch (err) {
    logger.warn({ err }, 'Pair resolution failed — proceeding with required pairs only');
    return requiredSymbols;
  }
}
```

The resolved list feeds directly into the combined stream URL:

```
wss://stream.binance.com:9443/stream?streams=
  <symbol>@depth20@100ms/<symbol>@ticker/   (repeated per resolved symbol)
```

`@depth20@100ms` supplies order book, pressure, and spread data; `@ticker` supplies live 24-hour percentage change for the watchlist, so that field updates continuously rather than only on pull-to-refresh.

**Rationale.**

1. **Correctness over convenience:** the pair list is a fact checked against live data at boot, not a guess frozen at design time — the same principle already applied to `/pairs/meta` sourcing real Binance data instead of fixtures (ADR-B6).
2. **Guaranteed mandatory scope:** the five required pairs are included unconditionally, so nothing about the "additional pairs" feature can ever regress the assignment's core requirement.
3. **Explicit domain judgment:** the exclusion rules (leveraged tokens, stablecoin pairs) encode a real design decision about what belongs in a real-time price viewer, made visible in code and in this document rather than left implicit.
4. **Single connection, simpler operations:** one combined connection is lower overhead and simpler to reconnect than managing N independent connections.

**Trade-offs accepted.**

- One more startup dependency on Binance's REST API, mitigated by the required-pairs fallback.
- Slightly more code than a hardcoded array — one resolver module and its tests. If time becomes constrained during implementation, this is the single feature in the overall design that can most safely be scoped back to "required five pairs only, dynamic resolution documented as a stretch idea" without weakening anything the assignment's mandatory requirements actually test.
- The exact set of additional pairs can differ between restarts as liquidity shifts — documented here as an intentional property, not a defect.

---

### ADR-B4: Stream Processing & Backpressure Strategy

**Context.** Raw market updates can arrive many times per second, across a pair set whose size is fixed at startup (five required, plus up to `EXTRA_PAIRS_COUNT` resolved additional pairs). Updates must be buffered/batched and emitted at a configurable interval (default 100ms), and slow consumers must never cause unbounded memory growth.

**Options considered — buffering model:**

| Option                          | Description                                                                              | Verdict                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Latest-state snapshot** | Maintain one in-memory state object per pair; on each timer tick, snapshot and broadcast | **Selected** — simple, naturally deduplicating, constant memory, predictable latency            |
| Delta queue                     | Queue every incoming delta, flush on tick                                                | Preserves every update, but risks memory spikes during bursts and requires complex deduplication logic |
| Token bucket                    | Rate-limit emissions per pair                                                            | More precision than this scale (five to eight pairs) needs                                             |
| Sliding window                  | Aggregate over a time window                                                             | Adds latency and complexity without a corresponding benefit here                                       |

**How it works.**

1. Incoming Binance messages continuously update an in-memory `Map<string, PairState>`, keyed by the pair list resolved in ADR-B3.
2. A timer (`BROADCAST_INTERVAL_MS`, default 100ms) fires at a fixed interval.
3. On each tick, the map is iterated, each pair's current state is serialized, and the result is broadcast to all connected clients.
4. This bounds memory structurally: the map's size equals the resolved pair count — a small, fixed number — regardless of how many clients are connected or how fast Binance emits updates upstream.

**Options considered — backpressure mechanism:**

| Option                                                                                               | Description                                                                                                              | Verdict                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded per-client message queue (fixed size, drop-oldest) plus a separate time-based lag disconnect | Two independent thresholds guarding against the same underlying failure mode                                             | **Rejected as the primary mechanism** — redundant given that the latest-state model above already guarantees at most one pending message per pair per client at any moment. Layering a second, independent safeguard on top adds a second threshold to reason about and test, without a proportional benefit. |
| **`ws.bufferedAmount` check before each tick's write, with consecutive-skip eviction**       | Uses the OS-level TCP send buffer as the single source of truth for whether a client's connection is actually keeping up | **Selected** — one clear signal, one clear consequence, straightforward to test in isolation                                                                                                                                                                                                                  |

**Selected mechanism, in full:**

- Before writing to a given client on each tick, check `ws.bufferedAmount`.
- If it exceeds `MAX_BUFFERED_BYTES` (default 64KB), skip that client for this tick — the message is not queued, since the next tick's snapshot supersedes it regardless.
- Track consecutive skips per client. If a client is skipped for `MAX_CONSECUTIVE_SKIPS` ticks in a row (default 10, roughly one second at the default interval), disconnect it with WebSocket close code `1013` ("Try again later") and increment the corresponding eviction metric.
- No per-client message history is retained anywhere. Memory is `O(pairs)`, never `O(clients × pairs × time)` — a structural property of the design, not a value that needs tuning to stay bounded.

> **Implementation precision — `lastUpdatedAt` synchronization.** Each conflated snapshot is stamped with `lastUpdatedAt` set to the wall-clock time of the *conflation tick that produced it* — not the raw timestamp carried in the originating Binance message. This reflects when the system itself processed and served the data, giving the mobile client one consistent, system-controlled timestamp to render, independent of minor variance in upstream delivery timing. On the mobile side, `marketStore.updatePair` must set this field directly from the incoming payload with no client-side recomputation, so `LastUpdatedLabel` always renders a value with a single source of truth (see ADR-M2, ADR-M8, ADR-M9, and §12).

> **Note — this same broadcast cadence also doubles as the mobile client's connection-liveness signal**, removing the need for a separate WebSocket heartbeat protocol. See ADR-M6.

**Rationale.**

1. **Scalability:** stateless per-symbol state with no per-client history means additional backend instances can be added behind a load balancer without a state-sharing problem.
2. **Performance:** constant memory, predictable latency, regardless of client count.
3. **Reliability:** a single backpressure signal with a single consequence is easier to reason about, operate, and test than multiple overlapping mechanisms would be.
4. **Testability:** the conflation step is a pure function (state + tick in, broadcast payload out); the eviction logic is a simple counter check — both independently unit-testable with no live network dependency.

**Trade-offs accepted.** Intermediate ticks between broadcasts are not individually delivered — acceptable, since a mobile watchlist does not need every micro-update, only a smooth, current view of the market.

---

### ADR-B5: Buy/Sell Pressure and Spread — Deterministic Calculation

**Context.** The assignment requires Buy Pressure, Sell Pressure, and Spread on the Market Details screen. Left undocumented, "pressure" is an ambiguous term with several reasonable interpretations — it needs one deterministic, testable definition, not an implicit detail buried inside a larger service.

**Decision.** Compute all three values as pure functions of the top-N order book levels, in `domain/services/PressureCalculator.ts`, with the exact formula documented rather than left implicit in code.

**Formulas:**

```
Spread            = lowest_ask_price − highest_bid_price          (quote currency, USDT)

Total Bid Volume  = Σ(quantity) across the top N bid levels        (N = ORDER_BOOK_PRESSURE_DEPTH, default 10)
Total Ask Volume  = Σ(quantity) across the top N ask levels        (same N)

Buy Pressure %    = (Total Bid Volume / (Total Bid Volume + Total Ask Volume)) × 100
Sell Pressure %   = 100 − Buy Pressure %
```

Sell Pressure is defined as the complement of Buy Pressure by construction — deliberately, so the two values always sum to exactly 100% with no independent rounding drift between them.

`ORDER_BOOK_PRESSURE_DEPTH` (the number of levels used for the pressure calculation) is a named, configurable constant, deliberately kept separate from the depth requested from Binance (`@depth20`, i.e. 20 levels) — the two can be tuned independently without touching unrelated code, and the value is not a hardcoded literal buried in the function body.

**Rationale.**

1. **Testability:** pure, side-effect-free functions are trivially unit-testable — given a fixture order book snapshot, the expected Spread and Pressure values are exact and reproducible.
2. **Verifiability:** documenting the formula explicitly, rather than leaving it as an implicit detail of one function's implementation, means it can be verified by hand against a real order book and reviewed independently of the code.
3. **Configurability without code changes:** decoupling the pressure-calculation depth from the Binance subscription depth means either can be tuned later without touching the other.

**Trade-offs accepted.** Using only the top N levels is a simplification relative to weighting the full book or using a decay-weighted measure. This is a standard, appropriate choice for a watchlist-level indicator, and is stated here as a deliberate scope decision rather than an oversight.

---

### ADR-B6: Metadata Endpoint Strategy

**Context.** `GET /pairs/meta` must return metadata for all currently supported trading pairs — which, per ADR-B3, is the dynamically resolved set, not a fixed five.

**Options considered:**

| Option                                                      | Pros                                                            | Cons                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Mock data only                                              | Simple, no external dependency                                  | Not representative of how a production metadata endpoint behaves |
| **Real Binance data with a documented mock fallback** | Production-realistic, accurate, resilient to a temporary outage | External dependency, requires fallback handling                  |
| Real Binance data with no fallback                          | Accurate                                                        | No resilience if Binance is briefly unreachable                  |

**Decision.** Real data from `GET https://api.binance.com/api/v3/ticker/24hr`, filtered to the currently resolved pair list (held in memory from the single startup resolution, not re-queried per request), mapped to the internal contract schema, cached for 60 seconds to bound outbound call volume.

**Fallback scope.** If Binance is unreachable, the endpoint falls back to mock data for the five required pairs specifically. The additional, dynamically resolved pairs are treated as a bonus feature and are allowed to simply be absent during a fallback rather than mocked — the guarantee is on the mandatory scope, not on best-effort extras.

**Rationale.**

1. A production metadata endpoint returning fixtures under normal operation would misrepresent how the system actually behaves.
2. Sourcing real data, with a scoped and honest fallback, is both more accurate and a better demonstration of real-world integration handling than either pure mocking or an unguarded external dependency.
3. Caching bounds outbound call volume to Binance without meaningfully staling the data — 24-hour statistics don't need sub-minute freshness.

**Trade-offs accepted.** An external dependency on Binance's REST API, mitigated by caching and the fallback path described above.

---

### ADR-B7: Backend Project Structure — Hexagonal Architecture with Explicit Ports

**Context.** A maintainable, testable structure is needed — one that actually enforces the dependency direction it claims to follow, rather than one that only names its folders after a pattern.

**Decision.** Ports-and-adapters (hexagonal) architecture, with `ports/` and `application/` made explicit as their own layers, not folded into `domain/` or `infrastructure/`.

```
pulsecrypto-backend/
├── contracts/                          # Source-of-truth wire-format schemas — see ADR-X1. This repo owns
│   └── schemas.ts                      # them; the mobile repo mirrors this file and CI diff-checks it.
├── src/
│   ├── config/
│   │   ├── env.ts                     # Zod-validated env vars, incl. EXTRA_PAIRS_COUNT, PAIR_RESOLUTION_TIMEOUT_MS,
│   │   │                               # ORDER_BOOK_PRESSURE_DEPTH
│   │   └── pairs.ts                   # REQUIRED_PAIRS constant only — the full pair list is resolved at
│   │                                   # runtime by BinancePairResolver, not hardcoded here
│   ├── domain/                        # Pure business logic — zero external or framework dependencies
│   │   ├── models/
│   │   │   ├── PairState.ts
│   │   │   ├── OrderBook.ts
│   │   │   └── MarketUpdate.ts
│   │   ├── services/                  # Pure domain logic only — no I/O, no framework calls
│   │   │   ├── PressureCalculator.ts  # Spread / buy / sell pressure — see ADR-B5
│   │   │   └── ConflationEngine.ts    # Applies an incoming update to the latest-state map — see ADR-B4
│   │   └── ports/                     # Interfaces — the hexagon's boundary, checkable, not just a convention
│   │       ├── MarketDataSource.ts    # Inbound: what an exchange adapter must implement
│   │       ├── Broadcaster.ts         # Outbound: what a transport adapter must implement
│   │       ├── MetadataProvider.ts    # Outbound: what a metadata source must implement
│   │       └── PairResolver.ts        # Outbound: what resolves the supported pair list at startup
│   ├── application/                   # Orchestration / use-cases — depends on domain + ports only
│   │   ├── ResolveSupportedPairs.ts   # Wires PairResolver at startup, applies the required-pairs guarantee
│   │   ├── ProcessMarketTick.ts       # Wires ConflationEngine + Broadcaster on each timer tick
│   │   └── GetPairsMeta.ts            # Wires MetadataProvider + caching, scoped to resolved pairs
│   ├── infrastructure/                # Adapters — implement the ports, depend on domain, never the reverse
│   │   ├── binance/
│   │   │   ├── BinanceWsAdapter.ts     # implements MarketDataSource — connects using the resolved pair list
│   │   │   ├── BinanceRestAdapter.ts   # implements MetadataProvider
│   │   │   ├── BinancePairResolver.ts  # implements PairResolver — full logic in ADR-B3
│   │   │   └── BinanceMessageParser.ts
│   │   ├── websocket/
│   │   │   ├── WsBroadcaster.ts       # implements Broadcaster — backpressure logic from ADR-B4
│   │   │   └── ClientRegistry.ts      # tracks connections + per-client consecutive-skip counters
│   │   └── observability/
│   │       ├── Logger.ts              # structured logging (pino)
│   │       └── Metrics.ts             # Prometheus metrics
│   ├── api/                           # Inbound HTTP port
│   │   ├── routes/
│   │   │   ├── pairs.ts               # GET /pairs/meta → GetPairsMeta use-case
│   │   │   ├── health.ts              # GET /health
│   │   │   └── metrics.ts             # GET /metrics
│   │   └── schemas/                   # Imports from ../../../contracts — this repo's own source of truth
│   │                                   # (ADR-X1), not a package dependency
│   ├── app.ts                         # Fastify app setup
│   └── server.ts                      # Composition root — see startup sequence below
├── tests/
│   ├── unit/                          # domain/ and application/ tested with ports mocked
│   └── integration/                   # infrastructure/ tested against a mock Binance server
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── tsconfig.json
├── package.json
└── README.md
```

**Startup sequence.**

1. `server.ts` loads and validates environment configuration.
2. It calls `ResolveSupportedPairs`, which calls the `PairResolver` port (implemented by `BinancePairResolver`) — this is the only step with a graceful fallback path (ADR-B3).
3. Only once the pair list is resolved are the remaining adapters instantiated — `BinanceWsAdapter` needs the resolved list to build its combined stream URL — and the Fastify app is started.
4. `GetPairsMeta` and `ProcessMarketTick` are both wired with the same resolved list.

**Dependency rule, enforced — not aspirational:**

- `domain/` imports nothing outside `domain/`.
- `application/` imports only `domain/`.
- `infrastructure/` imports `domain/` (to implement its ports); it is imported *by* `server.ts`, never the reverse.
- `api/` depends on `application/` only, never directly on `infrastructure/`.
- `server.ts` is the only file permitted to import concrete `infrastructure/` classes and wire them into `application/` — the composition root.

**Rationale.**

1. **`domain/` has zero external dependencies** — pure TypeScript, importable and testable without a framework, a database, or a network connection.
2. **`ports/` makes the hexagon's boundary literal and checkable**, rather than a naming convention that discipline alone has to maintain — this is what turns "hexagonal architecture" into an enforceable property of the codebase rather than a label attached after the fact.
3. **Maintainability:** the Binance adapter, or even the pair-resolution strategy, can change without touching broadcast logic.
4. **Testability:** domain and application logic can be tested with ports mocked, independent of any real network call; adapters are tested separately against a mock Binance server.
5. **Extensibility:** adding a second exchange means writing a new adapter implementing `MarketDataSource`, not modifying the domain.
6. **This is more structure than a three-route service strictly needs on its own — stated honestly.** The layering here is a deliberate answer to the role's explicit emphasis on SOLID, GRASP, and Clean/Hexagonal Architecture, not something a service this size would necessarily converge on by default. Complexity adopted because the evaluation criteria specifically call for it is a different thing than complexity added without a reason — see ADR-X1 and ADR-M6 for the reverse case, where similar-looking structure was removed after review.

**Trade-offs accepted.** More files and folders than a simple MVC layout, and it requires discipline to keep the layers separate — mitigated by the dependency rule above being explicit enough to lint-check via import restrictions if desired (for example, an ESLint rule forbidding imports from `infrastructure/` inside `domain/`).

---

### ADR-B8: Observability Strategy

**Context.** The backend's health and performance need to be observable in operation, not just inferable from logs after the fact.

**Decision.** `pino` for structured logging, `prom-client` for Prometheus metrics.

**Logging.** Structured JSON via `pino`, standard levels (fatal/error/warn/info/debug). The pair-resolution outcome is logged explicitly at startup — `info` with the resolved list on success, `warn` with the reason on fallback (ADR-B3).

**Metrics**, exposed at `GET /metrics`:

| Metric                                          | Type      | Purpose                                                                                                                |
| ----------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pulsecrypto_ws_connections_active`           | Gauge     | Current connected client count                                                                                         |
| `pulsecrypto_ws_messages_broadcast_total`     | Counter   | Successful broadcast messages sent                                                                                     |
| `pulsecrypto_ws_messages_dropped_total`       | Counter   | Incremented on both skip and eviction (ADR-B4)                                                                         |
| `pulsecrypto_ws_broadcast_latency_seconds`    | Histogram | Time from tick start to broadcast completion                                                                           |
| `pulsecrypto_binance_messages_received_total` | Counter   | Inbound messages from the Binance stream                                                                               |
| `pulsecrypto_supported_pairs_count`           | Gauge     | Set once at startup by`ResolveSupportedPairs` — confirms in production whether the fallback path (ADR-B3) was taken |

**Rationale.**

1. Logs explain what happened after the fact; metrics are what gets watched in real time — the two are complementary, not substitutes for each other.
2. Both are inexpensive to add relative to the operational signal they provide, and directly support the observability expectations described in the role.
3. The `supported_pairs_count` gauge specifically turns the dynamic pair-resolution decision (ADR-B3) into something operable in production, not just visible in a startup log line — an on-call engineer can confirm at a glance whether the fallback path was taken without searching logs.

**Trade-offs accepted.** Marginally more code than ad hoc `console.log` statements, and requires familiarity with the Prometheus exposition format — a standard, widely adopted trade for the operational value gained.

---

### ADR-B9: Security Strategy — Defense in Depth

**Context.** The backend needs protection against common categories of abuse and misconfiguration, including for the parts of the system not being deployed as part of this exercise.

**Decision.** A layered approach:

- **Secrets:** all configuration in `.env`, validated with Zod at boot, never committed (`.gitignore` covers `.env`, `*.pem`, `*.key`).
- **Input validation:** every REST input validated against a Zod schema.
- **CORS:** restricted to explicitly allowed origins.
- **Rate limiting:** `@fastify/rate-limit` on REST endpoints (100 requests/minute per IP).
- **WebSocket origin checking:** the `Origin` header is validated on upgrade, with a per-IP connection cap.
- **Dependency hygiene:** `npm audit` runs in CI.
- **Container security:** non-root user, minimal base image (`node:24-alpine`).
- **Transport (documented):** the README states explicitly that a production deployment would sit behind a TLS-terminating load balancer (`wss://`), even though local development runs plaintext `ws://`.
- **Outbound call discipline:** every call to Binance's REST API — at startup for pair resolution, and on the cached `/pairs/meta` path — is wrapped with the same timeout handling as any other external dependency; nothing waits unboundedly during boot.

**Rationale.**

1. These measures apply production-grade discipline to the parts of the system this exercise doesn't deploy, which is the point — a security posture that only exists for the parts being reviewed isn't a real posture.
2. The specific choices here — rate limiting, origin validation, connection caps — are the standard baseline for any internet-facing real-time service, and are stated as general good practice for a service of this shape rather than as a claim about any particular organization's specific internal security requirements, which aren't something this document has visibility into.

**Trade-offs accepted.** Marginally more setup complexity; rate limiting is tuned generously enough not to interfere with the mobile app's own expected traffic pattern.

---

## 3. Mobile Architecture Decisions

### ADR-M1: React Native Framework — Expo (Dev Client / Prebuild)

**Context.** A choice is needed between Expo and bare React Native CLI.

**Options considered:**

| Option                                 | Pros                                            | Cons                                                                                                                                             |
| -------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Expo (Managed / Expo Go)               | Fastest possible setup                          | No custom native modules — ruled out immediately, since Reanimated, MMKV, and the live WebSocket client all require native code                 |
| **Expo (Dev Client / Prebuild)** | Full native access, strong developer experience | Tied to Expo's release cadence (mitigated — frequent releases, no forced cloud dependency)                                                      |
| Bare React Native CLI                  | Full native control                             | Equivalent native capability to Dev Client today, at the cost of hand-maintaining native project files across every React Native version upgrade |

**Decision.** Expo, using Dev Client and Continuous Native Generation (`npx expo prebuild`) — not Expo Go, and not bare CLI. See §5 for the specific SDK version and a note on an SDK 56 regression that directly affects this project's animation library.

**Rationale.**

1. **Native Access When Needed:**

   - `npx expo prebuild` generates real `android/` and `ios/` directories — standard Gradle and Xcode projects, not a sandbox.
   - These can be opened in Xcode or Android Studio and edited directly, exactly as a bare CLI project's native folders would be.
   - The Expo Modules API provides a clean interface for writing custom native modules when required.
   - This matches the role's description of production-grade mobile work occasionally requiring direct native-project work when required — the native projects exist and are fully editable; they're simply not hand-carried across every framework upgrade by default.
2. **Capability for a Platform With Future Native Needs:**

   - Config plugins exist for common categories of native SDK a wagering platform would plausibly integrate over time — geolocation/geofencing compliance, KYC, biometrics — and where a config plugin doesn't yet exist for a specific SDK, the underlying native code still installs the same way it would in a bare project, since a Dev Client build *is* a real native project.
   - Full control over code signing and provisioning profiles remains with the developer, not with Expo.
   - EAS Build is entirely optional: `npx expo prebuild` followed by `npx expo run:android` / `npx expo run:ios` compiles with a local Gradle/Xcode toolchain, with no Expo account or cloud dependency required at any point.
3. **Lower Long-Run Maintenance Cost:**

   - Continuous Native Generation regenerates native projects from declarative configuration rather than requiring native project files (Podfile, Gradle, AppDelegate, MainApplication) to be hand-maintained through every React Native version bump.
   - This is a real, recurring engineering cost under the bare CLI model — one that scales with the number of native dependencies a project accumulates over time — and Dev Client avoids it by construction.
4. **Industry Direction, Both Sides Considered:**

   - React Native's own documentation recommends Expo as the default starting point for new projects.
   - Coinbase's Mobile DevX team has publicly stated its engineers work with React Native and Expo in production — a directly relevant precedent from a fintech/crypto company.
   - New Architecture (Fabric/TurboModules) is fully supported.
   - **Counter-evidence, stated plainly rather than omitted:** the picture isn't one-sided. Shopify announced in 2026 that it is moving its major applications away from React Native entirely, back to native Swift/Kotlin, citing AI-assisted native development narrowing cross-platform's traditional cost advantage — and as part of that move, Shopify is winding down its sponsorship of React Native open-source projects it built, including FlashList (see ADR-M3). That doesn't change the calculus for a small, from-scratch real-time viewer like PulseCrypto, where the native-integration surface is minimal and the iteration-speed benefit is real — but an honest technical comparison includes both data points, not only the one that supports the choice made.
5. **Fit for the Assignment as Specified:**

   - Faster iteration without sacrificing native capability.
   - Both Expo and bare RN CLI are explicitly listed as acceptable in the assignment brief — this is treated as an engineering judgment call rather than a compliance requirement, and is documented as such.

**Trade-offs accepted.**

- Dependency on Expo's release cadence, mitigated by frequent releases and the fact that EAS is never mandatory.
- A small number of bleeding-edge OS APIs may require a hand-written native module before a config plugin exists for them — equally true under bare CLI, so not a comparative disadvantage.
- A residual "unlearning curve" for engineers who still associate Expo with its older managed/bare split — addressed directly by point 1 above, since that split is outdated once Dev Client and CNG are the actual comparison point.

**Why not bare CLI:**

- Native capability is equivalent, not inferior, once Dev Client/Prebuild — rather than Expo Go — is the fair point of comparison.
- Bare CLI's one genuine remaining edge case (a team that never wants a generation step, or an OS API with literally zero native-module coverage anywhere) doesn't apply to this project.
- Bare CLI's traditional reputation for offering more genuine native control no longer reflects a real capability gap in 2026 — treating it as automatically the more rigorous choice would be weighing the tool's reputation rather than its actual, current capability.

---

### ADR-M2: State Management — Zustand + TanStack Query

**Context.** Both high-frequency WebSocket data and lower-frequency REST metadata need to be managed, across a pair set whose size beyond the required five is resolved dynamically by the backend (ADR-B3) rather than fixed.

**Decision.** Two purpose-fit tools, not one used for everything:

| Data                            | Source        | Tool                         | Why                                                                                |
| ------------------------------- | ------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| Market data (price, order book) | WebSocket     | **Zustand**            | High-frequency updates (100ms cadence), selector-based re-renders, direct mutation |
| Metadata (pair info, 24h stats) | REST          | **TanStack Query**     | Built-in caching, background refetch, loading/error states, request deduplication  |
| Favourites                      | Local storage | Zustand (persist middleware) | Simple, persisted key-value state                                                  |
| Connection status               | WebSocket     | Zustand                      | Simple UI-facing enum                                                              |
| Search query                    | UI            | Zustand / local state        | UI filter state                                                                    |

**Rationale.**

1. **Zustand for WebSocket-driven state:** its selector pattern keeps re-renders scoped to only the components subscribed to data that actually changed — important at a 100ms update cadence, where a naive context-based approach would re-render far more of the tree than necessary on every tick.
2. **TanStack Query for REST state — a deliberately forward-looking choice, not a today-only justification.** As it stands, `/pairs/meta` is the only REST call in the app, and a case could be made that a purpose-built server-state library is more than that single endpoint needs on its own. That framing undersells the actual reasoning: the split between "client state" (Zustand) and "server state" (TanStack Query) is an architectural boundary, and boundaries are far cheaper to establish before a codebase grows into needing them than to retrofit afterward, once ad hoc `fetch` calls and hand-rolled loading-state booleans have already spread across several screens. This mirrors the same reasoning already applied elsewhere in this document — the extensibility built into ADR-B3's pair resolution, or ADR-M8's feature-first structure being explicitly sized for a feature that doesn't exist yet — PulseCrypto's architecture is treated throughout as a production system's first iteration, not a disposable assignment scaffold, and the REST state layer is held to that same standard rather than to "what does today's one endpoint strictly require."
3. **Dynamic pair count, handled by design, not by exception:** `marketStore` is keyed by symbol, not by a fixed-length structure — it accommodates however many pairs the backend is actually broadcasting, and that count or membership can differ between app sessions if the backend resolved a different additional-pair set on its last restart. No component or store logic assumes an exact count of five.
4. **`lastUpdatedAt` handling:** `marketStore.updatePair` sets `lastUpdatedAt` directly from the field the backend's conflation tick produced (ADR-B4), with no client-side recomputation — the backend remains the single source of truth for "when was this data current," and `LastUpdatedLabel` (ADR-M8) simply renders what it's given, formatted per the active locale (ADR-M9).

**Trade-offs accepted.** Two libraries instead of one, and one dependency (TanStack Query) whose full value won't be visible until the REST surface grows beyond a single endpoint — accepted deliberately, as the cheaper time to establish this boundary is now, not after the fact.

---

### ADR-M3: List Rendering — FlashList

**Context.** The watchlist renders a dynamically-sized set of five or more pairs, each updating roughly every 100ms.

**Options considered:**

| Option              | Pros                                                          | Cons                                                                   |
| ------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| FlatList            | Built-in, familiar                                            | Recreates cells on frequent updates — a real cost at this update rate |
| **FlashList** | Recycles list cells instead of destroying and recreating them | Extra dependency; maintenance-continuity note below                    |
| SectionList         | Grouped sections                                              | Unnecessary structure for a flat watchlist                             |

**Decision.** FlashList (v2 line, built for React Native's New Architecture — see §5 for the specific version), which the project is already on via Expo.

**Rationale.**

1. Cell recycling is the property that matters under sustained update bursts, and it scales the same whether the list has five rows or eight.
2. Combined with `React.memo` on row components and Zustand's selector pattern (ADR-M2), only the row whose underlying data actually changed re-renders — the recycling and the selector-scoping work together, not independently.
3. Rather than cite an unverified performance multiplier, the actual measured difference will be profiled during the performance-hardening phase (Phase 5) and reported in the README with real numbers from this specific app, not a generic claim.

**Maintenance continuity, noted transparently.** FlashList was built and has primarily been maintained by Shopify. As part of its 2026 move away from React Native (see ADR-M1), Shopify has announced it is winding down its sponsorship of related open-source projects, including FlashList, by the end of the year. This does not change the technical recommendation — FlashList remains the strongest available option for this use case, and the library continues to function — but it is a maintenance-continuity risk worth monitoring, and it's stated here, consistently with ADR-M1, rather than left unmentioned in one place and disclosed in another.

**Trade-offs accepted.** An additional dependency with a slightly different API surface than FlatList, and the governance consideration noted above.

---

### ADR-M4: Animations — react-native-reanimated

**Context.** Price changes need to briefly flash green/red, and order book volume changes need to animate smoothly, without degrading under a 100ms update cadence.

**Options considered:**

| Option                            | Pros                                                                  | Cons                                             |
| --------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| Animated API (built-in)           | No extra dependency                                                   | Runs on the JS thread — can stutter under load  |
| **react-native-reanimated** | Runs on the UI thread, 60fps achievable independent of JS thread load | Extra native dependency                          |
| Lottie                            | Suited to complex, designed animations                                | Overkill for a color flash or a bar-width change |

**Decision.** `react-native-reanimated` (current major — see §5, including a specific version-pinning note relevant to this exact library).

**Rationale.**

1. Reanimated runs animations on the UI thread via worklets, so price-flash and order-book bar-width transitions are never blocked by JS-thread work processing the next incoming tick.
2. This is the single highest-leverage decision for the requirement that the interface remain smooth and responsive during sustained update bursts — an animation approach tied to the JS thread would be the first thing to visibly degrade under load, precisely when the assignment is testing for that degradation.
3. It's the de facto standard for this category of app (trading, real-time dashboards) for the same reason.

**Trade-offs accepted.** An additional native dependency, handled transparently by the Expo Dev Client setup (ADR-M1); a somewhat more involved animation API than the built-in `Animated`, in exchange for guaranteed UI-thread execution. See §5 for a known Expo SDK 56 regression affecting this exact library, and why that makes the specific SDK version choice non-cosmetic.

---

### ADR-M5: Local Persistence — MMKV

**Context.** Favourites, the last known market state, and (per ADR-M9) a manually-chosen language override all need to persist across app restarts.

**Options considered:**

| Option         | Pros                            | Cons                                                       |
| -------------- | ------------------------------- | ---------------------------------------------------------- |
| AsyncStorage   | Simple, built-in                | Asynchronous only, slower, string-based                    |
| **MMKV** | Synchronous, ~30x faster, typed | Native module (already available via the Dev Client setup) |
| SQLite         | Relational, powerful            | Overkill for simple key-value data                         |

**Decision.** MMKV, integrated via Zustand's `persist` middleware.

**Rationale.**

1. **Synchronous reads matter specifically on app launch:** a synchronous read means favourites — and, per ADR-M9, the user's language preference — render correctly on the very first frame, with no flash of an incorrect state while an asynchronous read resolves.
2. **No additional native-integration cost:** MMKV requires the native module already present via the Dev Client setup (ADR-M1), so adopting it doesn't introduce a new category of setup work.
3. **Performance headroom:** the roughly 30x read/write speed advantage over AsyncStorage is not strictly necessary for a small favourites array, but it is the correct default for any state that will be read synchronously on every app launch, and it costs nothing extra to choose it here.

```typescript
// favouritesStore.ts
export const useFavouritesStore = create<FavouritesState>()(
  persist(
    (set) => ({
      favourites: [],
      toggleFavourite: (pair) => set(...),
    }),
    { name: 'favourites-storage', storage: createJSONStorage(() => mmkvStorage) }
  )
);

// marketStore.ts — caches last known state so the app never shows an empty screen on launch
export const useMarketStore = create<MarketState>()(
  persist(
    (set) => ({
      pairs: { ... },
      updatePair: (pair, data) => set(...),
    }),
    {
      name: 'market-data-storage',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({ pairs: state.pairs }),
    }
  )
);
```

**An edge case worth naming here, resolved fully in ADR-M8.** Because the backend's additional (non-required) pairs are resolved dynamically (ADR-B3), a pair a user has favourited can, in principle, fall outside the backend's currently tracked set after a restart if its liquidity ranking has changed. This does not corrupt the favourites list — it's simply symbols — but it does need explicit UI handling, specified in full under ADR-M8.

**Trade-offs accepted.** A native module dependency, already covered by the Dev Client decision in ADR-M1.

---

### ADR-M6: WebSocket Client Strategy — Custom Hook

**Context.** The mobile app needs to connect to the backend's WebSocket server and handle reconnection reliably, and needs a way to detect a connection that has silently died without either side sending a close frame.

**Options considered:**

| Option                             | Pros                                                      | Cons                                                                                               |
| ---------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Native WebSocket API alone         | No dependency                                             | No reconnection, no backoff, no app-state awareness                                                |
| A third-party reconnection library | Some behavior provided out of the box                     | Generally browser-focused, limited configurability for RN-specific concerns like app backgrounding |
| **Custom hook**              | Full control, tailored to React Native's runtime behavior | More code to write and maintain                                                                    |

**Decision.** A custom `useWebSocket` hook.

**Options considered — connection liveness detection specifically:**

| Option                                 | Description                                                                                                          | Verdict                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dedicated ping/pong heartbeat protocol | Client and server exchange keepalive messages on a timer, independent of data traffic                                | **Rejected.** This backend broadcasts on a fixed cadence (`BROADCAST_INTERVAL_MS`, 100ms) whenever it's healthy, which is already a liveness signal — a connection that's actually alive is, by definition, delivering broadcasts. A separate heartbeat protocol would answer a question the data stream already answers, at the cost of an extra message type and server-side handling for it. |
| **Broadcast-silence timeout**    | Track time since the last message of any kind was received; treat the connection as dead if that exceeds a threshold | **Selected** — no new protocol surface, no server-side changes, and the threshold is defined as a multiple of the backend's own known broadcast interval rather than an arbitrary separate number                                                                                                                                                                                                 |

**Features.**

- Exponential backoff with jitter (1s → 2s → 4s → 8s, capped at 30s) for reconnection attempts.
- Liveness via broadcast silence, not a separate heartbeat: `STALE_CONNECTION_TIMEOUT_MS` (default ~1000ms, deliberately documented as roughly `MAX_CONSECUTIVE_SKIPS × BROADCAST_INTERVAL_MS` — the same multiple of the broadcast interval the backend itself uses in ADR-B4 to decide a client has fallen behind) — if no message arrives within that window, the connection is treated as dead and reconnection begins.
- App-state awareness — the connection is paused when the app is backgrounded and re-established on foreground, rather than reconnecting uselessly while the app isn't visible.
- An explicit connection-status enum: `CONNECTING | CONNECTED | DISCONNECTED | RECONNECTING`.

**Rationale.**

1. **No redundant liveness mechanism:** building a parallel keepalive channel next to a data stream that already implies "I'm alive" on every tick would be complexity solving a problem this specific design doesn't have — this was caught and corrected during review rather than shipped as an unexamined default.
2. **The threshold stays tied to its source, not a second independent number:** documenting `STALE_CONNECTION_TIMEOUT_MS` as a multiple of `BROADCAST_INTERVAL_MS` means the two can't silently drift apart if the broadcast interval is ever retuned — a plain, unrelated hardcoded timeout wouldn't have that property.
3. **Reliability:** an explicit state machine, owned by the application rather than a third-party library, handles edge cases specific to a mobile runtime (backgrounding, network interface switching) that a browser-focused library wouldn't anticipate.
4. **Testability:** the hook's state transitions — including the silence timeout — can be tested in isolation, independent of a real socket connection.
5. **Directly satisfies the assignment's stated requirement** to automatically reconnect when connectivity is restored, with the added correctness of not fighting the OS over background network usage.

**Trade-offs accepted.** More code than adopting a reconnection library, in exchange for full control over mobile-specific edge cases; the silence-timeout approach depends on the backend genuinely broadcasting at a predictable cadence whenever healthy, which ADR-B4 already guarantees by design — if that guarantee ever changed, this threshold would need revisiting alongside it.

**Defensive validation & error boundary — added for full NFR coverage (v8.1).** The
assignment's non-functional requirements explicitly call for "appropriate error handling,"
and a review of this document against that requirement found two concrete gaps: nothing
validated an incoming WebSocket message before applying it to `marketStore`, and nothing
prevented a rendering error from crashing the entire app to a white screen. Both are cheap
to close and are added here rather than left as an implicit assumption:

- **Message validation:** every incoming WS message is parsed against the mirrored Zod
  schema in `src/contracts/schemas.ts` (the same schema ADR-X1 already requires mobile to
  keep in sync with the backend) before it reaches `marketStore.updatePair`. A message that
  fails validation is logged (dev-only, not surfaced to the user) and dropped — it does not
  throw, does not crash the app, and does not corrupt the store with a partially-shaped
  object. This costs nothing new to adopt: the schema already exists for the contracts-sync
  requirement: this is simply putting it to use at the point data enters the app, not a new
  dependency or mechanism.
- **Error boundary:** the app's root (`app.tsx`, wrapping the navigator) is wrapped in a
  single top-level React error boundary with a minimal, localized fallback screen (a
  message plus a "reload" action) — not per-screen boundaries, which would be more
  structure than a five-to-eight-screen app needs. A rendering bug in one screen degrades
  to a recoverable fallback, not a native crash. No new dependency is required — a small
  class component implementing `componentDidCatch` is standard React and sufficient here;
  a library like `react-error-boundary` is optional convenience, not a functional
  requirement.

---

### ADR-M7: Offline Strategy

**Context.** The assignment requires defined behavior when the backend becomes unavailable: showing connection status, continuing to display the most recent data, and reconnecting automatically once connectivity is restored.

**Decision.** A three-tier approach:

- **Required:** stale data remains visible when the backend is unavailable; a connection-status indicator is always shown; reconnection is automatic with exponential backoff (ADR-M6).
- **Additional, low-cost value:** the last known market state is cached in MMKV (ADR-M5), so the app never shows an empty screen on a cold launch, even before the first live update arrives.
- **Explicitly out of scope:** a full offline mode with historical data or complex synchronization logic — not required by the assignment, and would add complexity without corresponding value here.

```typescript
const [connectionStatus, setConnectionStatus] = useState<
  'connecting' | 'connected' | 'disconnected' | 'reconnecting'
>('connecting');

const handleMarketUpdate = (data: MarketUpdate) => {
  useMarketStore.getState().updatePair(data.pair, data);
};

const handleDisconnect = () => {
  setConnectionStatus('disconnected');
  // The Zustand store is left untouched — stale data continues to render.
};

useEffect(() => {
  if (connectionStatus === 'disconnected') {
    const backoff = exponentialBackoff(attempt);
    setTimeout(() => {
      setConnectionStatus('reconnecting');
      connectWebSocket();
    }, backoff);
  }
}, [connectionStatus]);
```

**Rationale.** This satisfies the assignment's stated requirement directly, and the MMKV-cached last-known-state addition is a small amount of extra value (no empty screen on cold launch) for very little additional complexity, since the persistence mechanism already exists for favourites (ADR-M5).

**Trade-offs accepted.** Displayed data can be stale during a disconnection — mitigated by the always-visible connection-status indicator, which is the assignment's own stated mechanism for surfacing this to the user.

---

### ADR-M8: Mobile Project Structure — Feature-First Architecture with Internal Layering

**Context.** A maintainable, testable mobile structure is needed — one that scales gracefully as the application grows beyond its initial two to three screens, and whose repository interfaces reflect how each kind of data actually behaves rather than forcing every data source through the same shape.

**Options considered:**

| Option                                                                        | Pros                                                                                                                                                                 | Cons                                                                                                                                                         |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Layer-first (`src/domain`, `src/data`, `src/presentation`)              | Architectural boundaries visible at a glance for a very small app                                                                                                    | Poor scalability — adding one feature requires touching three or more disparate top-level folders; higher merge-conflict risk as the codebase and team grow |
| Feature-first, flat (`src/features/Watchlist.tsx`)                          | Good navigability, changes stay localized                                                                                                                            | Tends toward "God files" mixing domain logic, data access, and UI in one place without internal structure                                                    |
| **Feature-first with internal layering, plus a shared `core/` layer** | Localized feature development*and* enforced Clean Architecture boundaries within each feature; a small, deliberate shared layer for what's genuinely cross-feature | Slightly deeper nesting — mitigated by standard IDE path tooling                                                                                            |

**Decision.** Feature-first architecture with internal layering per feature, plus a small, explicitly-scoped `core/` layer for models, ports, and components genuinely needed by more than one feature.

A shared layer inside an otherwise feature-first structure is not a contradiction of the pattern — it's the standard, deliberate exception most feature-first conventions (including Feature-Sliced Design's own "shared" layer) make for exactly this situation. The discipline is in keeping `core/` as small as it can genuinely be and defaulting new code to feature ownership, not in avoiding a shared layer altogether — a shared layer used as a dumping ground defeats the purpose just as much as not having one does.

**Structure:**

```text
pulsecrypto-mobile/
├── android/                       # Generated by expo prebuild — not committed (ADR-M1)
├── ios/                           # Generated by expo prebuild — not committed
├── src/
│   ├── contracts/                 # Mirrored copy of the backend repo's contracts/ — see ADR-X1.
│   │   └── schemas.ts               # CI diff-checks this against the backend's raw GitHub URL on every build.
│   ├── core/                      # Deliberately small — only what 2+ features genuinely need
│   │   ├── domain/
│   │   │   ├── models/
│   │   │   │   ├── MarketData.ts          # includes lastUpdatedAt — ADR-B4, ADR-M2, §12
│   │   │   │   ├── OrderBook.ts
│   │   │   │   └── TradingPair.ts
│   │   │   └── repositories/
│   │   │       └── IMarketRepository.ts   # subscription-based — see interface spec below.
│   │   │                                   # Lives in core/, not in one feature, because both
│   │   │                                   # `watchlist` and `market-details` depend on it.
│   │   ├── data/
│   │   │   ├── repositories/
│   │   │   │   └── MarketRepository.ts     # implements IMarketRepository — the shared, WS-backed
│   │   │   │                                # live data source
│   │   │   ├── sources/
│   │   │   │   ├── WebSocketSource.ts
│   │   │   │   └── RestSource.ts
│   │   │   └── mappers/
│   │   │       └── MarketDataMapper.ts     # DTO → domain model
│   │   ├── components/                     # Shared, presentation-only components — no feature-specific logic
│   │   │   ├── PriceText.tsx                # animated price, used on both watchlist rows and detail screen
│   │   │   ├── ChangeBadge.tsx               # 24h change pill, same reuse
│   │   │   ├── ConnectionIndicator.tsx
│   │   │   ├── LastUpdatedLabel.tsx          # renders MarketData.lastUpdatedAt — required field, §12
│   │   │   └── UntrackedFavouriteBadge.tsx   # see behavior spec below
│   │   ├── i18n/                             # Localization — see ADR-M9
│   │   │   ├── i18n.ts                        # i18next init, device-locale detection, MMKV override lookup
│   │   │   └── locales/
│   │   │       └── en/
│   │   │           ├── common.json             # shared strings: connection states, generic labels
│   │   │           ├── watchlist.json
│   │   │           ├── market-details.json
│   │   │           └── favourites.json
│   │   ├── theme/                            # Design tokens, colors, typography
│   │   ├── utils/                            # formatPrice, formatPercent — locale-aware via Intl (ADR-M9)
│   │   ├── api/                               # Base HTTP client, WebSocket client construction
│   │   ├── hooks/                             # Generic, non-feature-specific hooks
│   │   │   ├── useWebSocket.ts                 # the raw connection hook — see ADR-M6
│   │   │   └── useAppState.ts
│   │   └── storage/                            # MMKV configuration and storage adapter
│   ├── features/                               # Domain-driven feature modules — feature-owned by default
│   │   ├── watchlist/
│   │   │   ├── presentation/
│   │   │   │   ├── WatchlistScreen.tsx          # composes core/data's MarketRepository +
│   │   │   │   │                                 # favourites/'s public useFavourites() — see behavior spec
│   │   │   │   ├── PairRow.tsx                   # composes core/components (PriceText, ChangeBadge, etc.)
│   │   │   │   ├── SearchBar.tsx
│   │   │   │   └── useWatchlist.ts
│   │   │   └── index.ts                          # barrel export — this feature's public surface (currently none
│   │   │                                          # needed by other features; kept for consistency)
│   │   ├── market-details/
│   │   │   ├── presentation/
│   │   │   │   ├── MarketDetailScreen.tsx
│   │   │   │   └── OrderBookView.tsx
│   │   │   └── index.ts
│   │   └── favourites/                            # Genuinely feature-scoped — no other feature reads or
│   │       │                                        # writes favourites data directly
│   │       ├── domain/
│   │       │   └── IFavouritesRepository.ts         # see interface spec below
│   │       ├── data/
│   │       │   └── FavouritesRepository.ts           # MMKV-backed, implements IFavouritesRepository
│   │       ├── presentation/
│   │       │   └── useFavourites.ts                   # toggle logic, exposed via the barrel below
│   │       └── index.ts                                # exports useFavourites() — the ONLY way another
│   │                                                    # feature is permitted to touch favourites state
│   ├── store/
│   │   └── uiStore.ts                                  # cross-feature global UI state only: isOnline,
│   │                                                     # activeTab, activeLocale — deliberately minimal,
│   │                                                     # same discipline as core/
│   ├── navigation/
│   │   ├── AppNavigator.tsx
│   │   └── types.ts
│   └── app.tsx                                           # Entry point, providers (QueryClientProvider,
│                                                            # I18nextProvider, etc.)
├── assets/
├── app.json
├── tsconfig.json
├── package.json
└── README.md
```

**Repository interfaces, shaped to match real behavior:**

```typescript
// core/domain/repositories/IMarketRepository.ts
// Market data is a continuous push stream from the backend WebSocket, not a fetchable
// resource — the interface is subscription-based to match that, rather than a promise-
// returning getter later retrofitted into an observer pattern. It lives in core/, not
// inside a single feature, specifically because both `watchlist` and `market-details`
// depend on it — placing it under either feature would force the other to reach into
// a sibling feature's internals.
export interface IMarketRepository {
  subscribe(pair: TradingPairSymbol, onUpdate: (data: MarketData) => void): Unsubscribe;
  getSnapshot(pair: TradingPairSymbol): MarketData | null; // last-known value, synchronous, for first render
  getTrackedPairs(): TradingPairSymbol[]; // whatever the backend is currently broadcasting
}
export type Unsubscribe = () => void;

// features/favourites/domain/IFavouritesRepository.ts
// Favourites are simple local key-value state with no streaming behavior, and — unlike
// market data — are genuinely needed by only one feature's own logic. A conventional
// promise/mutation-based interface is the correct fit, and it stays inside `favourites/`
// rather than moving to core/: nothing else needs to read or write it directly.
export interface IFavouritesRepository {
  getAll(): Promise<TradingPairSymbol[]>;
  toggle(pair: TradingPairSymbol): Promise<void>;
}
```

**Untracked-favourite behavior, stated explicitly and consistent with the barrel-export discipline above.** `WatchlistScreen` (in `features/watchlist/presentation`) merges two sources to decide what to render: the live tracked-pairs list obtained from `core/data`'s `MarketRepository.getTrackedPairs()`, and the user's favourited symbols obtained through `features/favourites`'s public `useFavourites()` hook — exported from that feature's `index.ts`, never by importing `features/favourites/data` directly. A favourited pair that is not currently in the tracked set still renders, via `core/components/UntrackedFavouriteBadge` (placed in `core/` rather than inside `watchlist/`, since it's a generic "this pair currently has no live data" indicator that could plausibly be reused elsewhere), showing a localized "Not currently tracked" string (ADR-M9) — it is never hidden, and its absence from the live feed never causes an error or a crash in the list.

**Rationale.**

1. **Scalability:** adding a new feature — a "Portfolio" screen, for instance — means creating one new folder under `features/`, without needing to hunt through a shared `domain/`, `data/`, or `presentation/` directory that every other feature also touches.
2. **Reduced merge-conflict surface:** multiple developers working on `watchlist` and `market-details` simultaneously touch almost entirely disjoint sets of files.
3. **Clean Architecture preserved, at the right granularity:** the domain/data/presentation dependency direction is still enforced, but locally within each feature (and within `core/`), which is easier to audit than a codebase-wide version of the same rule — a reviewer checking `favourites/` only needs to look inside `favourites/`.
4. **The shared layer is scoped by an explicit test, not by convenience:** something belongs in `core/` only if two or more features genuinely depend on it (`MarketData`, `IMarketRepository`, `PriceText`, the i18n setup) — `favourites` stays feature-owned precisely because nothing else needs to reach into it, and the barrel-export (`index.ts`) convention makes that boundary enforceable rather than aspirational.
5. **Consistent with common practice for this pattern at scale** — feature-first-with-internal-layering, using a small shared kernel, is a widely recommended structure for growing React Native codebases for the reasons above, not a bespoke invention for this project.

**Trade-offs accepted.**

- Slightly deeper folder nesting (for example, `src/features/watchlist/presentation/PairRow.tsx`) — a minor cost, well handled by standard IDE path autocomplete.
- A shared `core/` layer reintroduces, in miniature, the same "spread across folders" property that layer-first architecture has at full scale — accepted deliberately, and kept small by the explicit two-or-more-features test above, rather than left to grow unchecked.

---

### ADR-M9: Internationalization (i18n) Strategy

**Context.** User-facing text (screen titles, labels, connection status, empty states, the "Not currently tracked" badge, and every other string a user reads) needs to be localizable. This is worth deciding at the start of the project rather than after screens are built, because retrofitting localization onto a codebase where strings are hardcoded directly into JSX across many components is one of the more tedious and error-prone categories of technical debt to pay down — every component has to be individually audited and edited. Establishing the pattern now costs one library and a small amount of setup ceremony; establishing it later costs a project-wide sweep.

**Options considered:**

| Option                                                                                | Pros                                                                                                                                                                                                                                      | Cons                                                                                                                              |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Hardcoded English strings, localize later if ever needed                              | Zero setup cost right now                                                                                                                                                                                                                 | Every user-facing string becomes a future retrofit; historically expensive technical debt, not a neutral deferral                 |
| **i18next + react-i18next, with expo-localization for device locale detection** | Industry-standard for React/React Native, mature ecosystem, supports interpolation/pluralization/namespaced lazy loading;`expo-localization` is maintained by the Expo team itself and stays version-aligned with the SDK automatically | Extra dependency, one-time setup cost                                                                                             |
| lingui (macro-based)                                                                  | More type-safe string extraction, compile-time key checking                                                                                                                                                                               | Heavier build-tooling setup (babel/SWC macros) for a project this size; steeper learning curve without a corresponding payoff yet |
| Meta's FBT                                                                            | Battle-tested internally at Meta                                                                                                                                                                                                          | Thin React Native ecosystem support and documentation relative to i18next outside Meta's own infrastructure — a poor fit here    |

**Decision.** `i18next` + `react-i18next` for translation strings and formatting logic; `expo-localization` for device-locale detection. Structure and wire the pattern fully now; ship with a complete English (`en`) translation as the only shipped locale, proving the mechanism end-to-end without committing to translating and maintaining additional languages for this exercise.

**Implementation.**

- `core/i18n/i18n.ts` initializes `i18next`, detects the device's locale via `expo-localization` at launch, and falls back to English if the device locale has no corresponding translation namespace.
- Translation files are namespaced per feature (`common.json`, `watchlist.json`, `market-details.json`, `favourites.json`), mirroring the codebase's own feature-first structure (ADR-M8) — a contributor or translator finds a screen's strings exactly where the screen's code lives conceptually, rather than in one large undifferentiated file.
- A manual language override, when the user explicitly picks a language rather than relying on device locale, is persisted in MMKV via the same mechanism already used for favourites (ADR-M5) — reusing an existing, proven pattern rather than introducing a second persistence approach for a single settings value.
- **Number and date formatting is locale-aware by construction, not just the label text around it.** `core/utils/formatPrice.ts` and `formatPercent.ts` (already part of the structure per ADR-M8) use `Intl.NumberFormat` with the active locale, since thousands separators and decimal points are not universal (`1,234.56` vs. `1.234,56`); `LastUpdatedLabel`'s timestamp rendering uses `Intl.DateTimeFormat` for the same reason. Localizing only the static labels while leaving number formatting hardcoded to one convention would be an incomplete implementation of the same idea.

**Rationale.**

1. Establishing this boundary now is cheap; retrofitting it after strings are scattered through many components is expensive — the same reasoning already applied to TanStack Query's client/server-state split (ADR-M2) and the shared `core/` layer (ADR-M8), applied consistently here rather than as an isolated, one-off addition.
2. `expo-localization`'s alignment with the Expo SDK release cycle removes one class of version-compatibility risk that a less-integrated device-locale library could introduce.
3. `i18next`/`react-i18next` is the de facto standard for this problem in the React ecosystem, well past the risk of being an obscure or under-maintained choice — the opposite concern from the one raised about FlashList in ADR-M3.
4. Namespacing by feature rather than by one flat file is a small decision with a real payoff as the string count grows — it mirrors a structural choice (ADR-M8) already made for the same reason.

**Trade-offs accepted.**

- One additional dependency and a small amount of upfront setup (provider wiring, the `core/i18n/` module) for an app that, strictly by the assignment's own requirements, only needs to render in one language.
- Shipping only English initially means the localization story right now is about correct infrastructure — the mechanism, the formatting discipline, the namespace structure — rather than about actual translated content in multiple languages, and the README should state that distinction plainly rather than imply broader language coverage than exists.

---

### ADR-M10: Mobile Design System & Screen Scope — Sourced from Figma via API

**Context.** This document's earlier versions treated the Figma mockup as the visual
source of truth for all four of the assignment's mobile screens (§"Reference Materials"),
on the assumption that its content would map cleanly onto those four screens. That
assumption was never actually verified against live Figma data until this revision — no
Figma MCP connector or Dev Mode session was available earlier, and a plain URL fetch only
ever returns Figma's client-rendered shell (confirmed twice, v8.1). It became verifiable
once the developer generated a personal access token and granted API access, at which
point pulling the file's real content (`GET /v1/files/:key`, `/nodes`, node-by-node) surfaced
a genuine mismatch worth recording as a decision, not silently absorbing.

**What the Figma file actually contains.** One page, two designed screens:

- `PulseCrypto | Trading Terminal` — a single-pair detail view: price ticker (price, 24h
  high/low, **market cap**), a Bids/Asks order book table, a "Market Depth Visualization"
  panel with a qualitative pressure/liquidity-gap legend, and a hidden-by-default account
  side-drawer (profile tier/ID, API Keys, Security, Trade History, Support, Sign Out).
- `PulseCrypto | Telemetry & Settings` — a bento-grid **developer performance dashboard**:
  a data-throttling configurator (update-frequency slider, protocol/polling toggles), a
  live telemetry card (JS-thread FPS gauge, WS message-rate counter, memory graph), and
  three stat micro-cards (GPU acceleration, API latency, storage cache).

Both screens share a bottom nav bar with **four tabs — Terminal, Markets, Telemetry,
Settings** — but only two of the four have a designed screen behind them. There is no
`Markets` screen: the assignment's actual required watchlist (five-pair list, search,
favourite toggle) isn't mocked anywhere in the file. Conversely, a large fraction of what
*is* mocked — the account drawer, the entire telemetry/settings dashboard — sits outside
the assignment's Part 2 functional requirements entirely.

**Decision.** Presented to the developer as an explicit choice (not resolved unilaterally),
who chose: **build everything the Figma file provides at full, literal fidelity — including
the parts outside the assignment's stated scope — and design the one required screen Figma
doesn't cover (Markets/Watchlist, with Search and Favourites) fresh, in the same
Figma-verified visual language, rather than reinterpreting or trimming what Figma
specifies.** Concretely:

- `Terminal` = the assignment's "Market Details" screen, parameterized per selected pair
  (Figma shows a fixed "BTC/USDT"; the real app renders whichever pair is active). The
  assignment's required numeric fields Figma doesn't show — Buy Pressure %, Sell Pressure
  %, Spread, Last Updated Timestamp — are added onto this screen using the same
  typography/spacing system, since the assignment's requirement doesn't bend to the
  mockup's omission of it. The "Market Cap" ticker cell is replaced with "24H Volume" (the
  field the backend's `/pairs/meta` actually provides — ADR-B6); the assignment doesn't
  ask for market cap, and no data source in this system provides it.
- `Markets` = the assignment's "Market Watchlist" screen (+ Search, + Favourites), designed
  fresh using the extracted color/type/spacing tokens (ADR-M10, `design-tokens.md`) since
  no Figma frame exists to build it against.
- `Telemetry & Settings` and the account drawer are built exactly as designed, **at the UI
  layer**, despite having no corresponding functional requirement or backend support:
  - Controls with no backing system (the throttling configurator's slider/toggles, API
    Keys/Security/Trade History/Sign Out in the account drawer) are implemented as local UI
    state only — visually functional, not wired to anything real. This is stated plainly in
    the README as intentional, not left for a reviewer to discover.
  - Metrics that *are* genuinely obtainable client-side — the WS message-ingestion rate
    (trivial: `useWebSocket` already receives every message) and JS-thread FPS (obtainable
    via a frame-time sampler or Reanimated's frame callback, which is already a dependency —
    ADR-M4) — are wired to real values rather than faked, since the honest version costs
    little more than a fake one. Memory footprint, which is genuinely hard to obtain
    accurately in an Expo-managed app without a native module, is approximated or
    explicitly labeled as illustrative rather than presented as precise.

**Design tokens.** Colors, typography, spacing, and corner radii were extracted directly
from the file's REST API response (fills, text styles, and auto-layout padding/spacing
properties on real nodes), not estimated from a screenshot or a description. Full token
set: `pulsecrypto-mobile/specs/design-tokens.md`. Background base color, text colors,
buy/sell signal colors (green `#3FE092`/red `#EA295B`, confirming the standard convention
ADR-M4 assumed), the JetBrains-Mono-for-numerics / Inter-for-labels / Hanken-Grotesk-for-
headings type system, and a 4/8px-based spacing scale are all verified, traced values.

**Rationale.**

1. **This is the same principle the "Reference Materials" section already stated in
   advance** — "where the mockup and this document could plausibly conflict... flag the gap
   and resolve it explicitly rather than silently picking one source over the other." This
   ADR is that principle actually exercised against a real, found conflict, not a
   hypothetical one.
2. **Building the out-of-scope Figma content is a deliberate scope expansion, made at the
   developer's explicit direction, not a default this document would have chosen
   unprompted.** Left to this document's own judgment, the more conservative call — skip
   the account drawer and telemetry dashboard as decorative scope creep with no functional
   backing, matching this document's stated discipline of not adding complexity that isn't
   earning its place (Executive Summary, §1) — was the recommendation actually made. The
   developer's reasoning for overriding that recommendation is presentation fidelity: the
   assignment is evaluated in part on the finished application, and a submission that
   visibly matches its own referenced mockup, in full, is worth more than a strictly
   scope-minimal one for that specific evaluation criterion. Both are legitimate
   engineering judgments about what a reviewer will actually weigh; this document records
   which one was chosen and why, rather than picking one silently.
3. **Real-vs-mock data treatment per control is decided by whether a real, cheap source
   exists, not by whether a control looks impressive.** This is the same standard applied
   throughout this document (e.g. ADR-B6's metadata fallback, ADR-M5's synchronous-read
   choice) — honesty about what's real costs nothing extra here and is worth stating
   explicitly per control rather than leaving a reviewer to guess which numbers on the
   Telemetry screen are live.

**Trade-offs accepted.** The mobile app now has five screens instead of the assignment's
four, two of which (Telemetry & Settings, the account drawer) exist purely for design
fidelity and contain no functional requirement or backend support — real implementation
effort spent on scope the assignment doesn't ask for and doesn't test, accepted
deliberately for the presentation-fidelity reason above. The Markets/Watchlist screen,
being freshly designed rather than mockup-sourced, carries a small risk of looking visually
inconsistent with the Figma-sourced screens if the token system isn't followed carefully —
mitigated by `design-tokens.md` being the single source every screen (mocked or not) draws
from.

---

## 4. Cross-Cutting Decisions

### ADR-X1: Repository & Contract Strategy

**Context.** The backend and mobile codebases are organized as separate repositories, and the WebSocket/REST payload contract between them — two independently deployable services — needs to not silently drift out of sync, without adding operational risk disproportionate to what it's protecting against in this specific context: a solo developer building both repositories, most likely in the same sitting or the same AI-assisted session.

**Options considered:**

| Option                                                                                                                                                                             | Pros                                                                                                                                                                       | Cons                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Monorepo                                                                                                                                                                           | Shared types, single CI pipeline                                                                                                                                           | Setup complexity disproportionate to this project's scope, and doesn't match the assignment's own framing of two separate deliverables                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Two repos, contract duplicated, no automated check                                                                                                                                 | Simplest possible setup                                                                                                                                                    | Pure manual discipline — a real drift risk, not just a theoretical one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Two repos + a published shared package (`@pulsecrypto/contracts`, via GitHub Packages)                                                                                           | Contract-first; drift caught by CI rather than by hoping someone remembers                                                                                                 | **Rejected on review.** GitHub's own documentation states plainly that an access token is required to install a package via GitHub Packages — public or private, no exception. A reviewer cloning the mobile repository and running `npm install` would fail unless they had their own personal access token configured, which risks breaking the single most basic requirement of a submission: that it installs and runs. This is a worse failure mode than the drift risk it was meant to solve, and a third repository/package to publish and version is disproportionate overhead for one developer building both consuming sides. |
| **Two repos; `contracts/` owned by the backend, mirrored into the mobile repo, drift caught by a CI step that diffs the mobile copy against the backend's raw GitHub URL** | Gets the meaningful protection — drift becomes a build failure, not a hope — with zero registry, zero publish step, and zero authentication anywhere in the install path | The mobile copy is a mirror, not a live import — a deliberate, disclosed trade, not an oversight                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**Decision.** Two repositories only — `pulsecrypto-backend` and `pulsecrypto-mobile`. No third repository, no package registry.

**Contract strategy:**

- `contracts/` at the root of `pulsecrypto-backend` holds the Zod schemas and TypeScript types for every WebSocket payload and REST response shape, including `SupportedPairsMeta` (the resolved pair list plus a `resolvedAt` timestamp). This is the source of truth — the backend is what defines the wire format it emits, so it owns the definition.
- `pulsecrypto-mobile` keeps a local mirrored copy at `src/contracts/` — a small, deliberately duplicated set of files (a handful, not a sprawling package), not a package dependency.
- Mobile's CI includes a drift-check step that fetches the backend repository's `contracts/schemas.ts` via `raw.githubusercontent.com` — which serves a public repository's file contents with no authentication required, unlike GitHub Packages — and fails the build if it differs from the local mirrored copy:

```yaml
- name: Check contracts are in sync with backend
  run: |
    curl -sf https://raw.githubusercontent.com/<you>/pulsecrypto-backend/main/contracts/schemas.ts -o /tmp/upstream-schemas.ts
    diff /tmp/upstream-schemas.ts src/contracts/schemas.ts
```

**Rationale.**

1. Two independently-deployable services sharing a wire contract with zero drift detection is a real risk even for a solo project — a schema change made while iterating on one repository and not yet carried over to the other is exactly the kind of thing that's easy to lose track of mid-implementation, particularly when using an AI coding tool that's iterating quickly on one repository at a time.
2. A published package solves that same problem but introduces a strictly worse one: GitHub Packages' authentication requirement risks breaking installation for the person reviewing the submission, which is a more serious failure than the drift risk it replaces.
3. The raw-URL diff check keeps the part of the original design that had genuine value — automated, CI-enforced, not manual discipline — while removing every piece that could fail for a reason unrelated to the code's own correctness.
4. This is proportionate to a single developer building both repositories closely together: the coordination failure a shared package protects against — different teams, different deploy cadences, someone forgets — barely has room to occur in that context, so paying its full operational cost (and risk) isn't justified here.

**Trade-offs accepted.**

- Mobile's copy is a mirror kept in sync by CI, not a live, type-checked import from a single package — a real but small trade, accepted deliberately in exchange for removing the registry/authentication risk entirely.
- If this project ever grew into a genuinely multi-service, multi-team setting, revisiting a published package — this time on the public npmjs.org registry rather than GitHub Packages, specifically to avoid the same authentication problem — would be the natural next step. Noted here as a forward-looking observation, not a current gap.

---

### ADR-X2: Git Strategy — Gitflow, Conventional Commits, and a Full Pre-Commit Hook Pipeline

**Context.** A branching and commit convention is needed, alongside automated local enforcement of code quality before anything reaches shared history — relying on CI alone means problems are caught minutes after a push instead of seconds before a commit, and relying on human discipline alone means they're sometimes not caught at all.

**Decision.** Gitflow — a persistent `develop` integration branch, short-lived `feature/*` branches off it, `release/*` branches for stabilizing a set of features, and `hotfix/*` branches for urgent post-release fixes, with `main` reserved exclusively for tagged, released code — alongside Conventional Commits and the same three-stage Husky hook pipeline, applied identically in both repositories.

**Branching:**

```
main (production-only, protected, tagged releases — receives merges only from release/* or hotfix/*)
 └── develop (integration branch, always green, protected — receives merges only from feature/* or release/*)
      ├── feature/backend-binance-client
      ├── feature/backend-pair-resolver
      ├── feature/backend-ws-server
      ├── feature/mobile-watchlist
      ├── feature/mobile-details
      ├── feature/mobile-i18n
      ├── release/v1.0.0            (branches from develop; only fixes land here, no new features;
      │                               merges into both main, tagged, and back into develop)
      └── hotfix/reconnection-logic (branches from main for an urgent fix to released code;
                                      merges into both main, tagged, and develop)
```

- `feature/*` branches off `develop`, PR'd and squash-merged back into `develop`.
- `release/*` branches off `develop` once a coherent set of features is ready to stabilize;
  only bug fixes are permitted on a release branch, never new feature work; on completion
  it merges into both `main` (tagged, e.g. `v1.0.0`) and back into `develop`, so any
  release-branch fixes aren't lost on the next cycle.
- `hotfix/*` branches off `main` directly, for an urgent fix to what's already released;
  merges into both `main` (tagged, e.g. `v1.0.1`) and `develop`, for the same reason.
- `main` never receives a feature merge directly — every change reaches it only via a
  `release/*` or `hotfix/*` branch, so its history reads as a sequence of releases, not
  day-to-day development noise.

**Conventional Commits, examples:**

```
feat(backend): add Binance WebSocket client with combined stream
feat(backend): add dynamic pair resolver with liquidity ranking and fallback
feat(mobile): add i18next setup with English namespace files
fix(mobile): resolve FlashList re-render issue on price update
docs(readme): add architecture decision records
test(backend): add unit tests for ConflationEngine
test(backend): add unit tests for BinancePairResolver fallback path
chore(ci): add contracts drift-check step
perf(mobile): optimize Zustand selectors for pair-level updates
```

**Pre-commit hook pipeline — the specific mechanics, in both repositories identically:**

| Hook                  | Runs                               | Purpose                                                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.husky/pre-commit` | `lint-staged`                    | ESLint`--fix` and Prettier `--write`, scoped only to staged files — fast enough to run on every commit without friction                                                                                                                                                    |
| `.husky/commit-msg` | `commitlint`                     | Validates the commit message against Conventional Commits format; a malformed message is rejected before it enters history                                                                                                                                                      |
| `.husky/pre-push`   | `tsc --noEmit` + full test suite | Lint-staged only touches staged files — a change in one file can break a type or a test in a file that wasn't staged. Pre-push is the safety net that catches that class of problem before it reaches a shared branch, at the point where the cost of catching it is still low |

`lint-staged` configuration:

```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{js,jsx,json,md}": ["prettier --write"]
}
```

`--no-verify` remains available as a standard, intentional escape hatch for genuine work-in-progress commits on a local branch — the pipeline is meant to guard what reaches shared history, not to make local iteration painful.

**Rationale.**

1. Gitflow gives an explicit, inspectable separation between "in-progress integration"
   (`develop`) and "what's actually released" (`main`), plus a defined path for stabilizing
   a release (`release/*`) and patching one after the fact (`hotfix/*`). Even for a
   single-developer submission, this makes the branch history itself demonstrate release
   discipline — a reviewer can see the model in the commit graph, not just read a claim
   about it in the README.
2. **This revises this ADR's own earlier position (see §13 Document History), stated
   honestly rather than silently overwritten.** The prior decision (GitHub Flow) argued
   that a single-contributor, single-release-train project has no real coordination need
   for `develop`/`release`/`hotfix` branches, and that argument was not wrong on its own
   terms — Gitflow is genuinely more branch-management overhead than this project's actual
   release cadence requires. The decision to adopt it anyway is made deliberately: the
   assignment is evaluated partly on demonstrated engineering process, and a fully worked
   Gitflow history is itself a legible artifact of that process for a reviewer, which is a
   real benefit specific to this being an evaluated exercise rather than a genuine
   production solo project — the same kind of context-specific trade this document makes
   elsewhere (see ADR-B7 and ADR-M9 for cases where the evaluation context, not the
   project's size alone, justified more structure than a minimal build would choose).
3. Conventional Commits produce a readable, structured history and enable automated changelog generation, at minimal ongoing cost once the lint hooks are in place.
4. Splitting the pipeline into three stages — fast/scoped at commit time, format-only at commit-message time, slow/exhaustive at push time — matches each check's cost to the point in the workflow where it's cheapest to enforce: nobody waits for a full test suite on every keystroke-adjacent commit, but nothing reaches a shared branch without having passed one.
5. Applying the identical pipeline to both repositories means the same quality bar holds on both sides of the system, not just the one that happened to get more attention.

**Trade-offs accepted.** More branches and merge steps than the work strictly requires for a project this size, and two protected branches (`main`, `develop`) to keep in sync via `release/*`/`hotfix/*` merges rather than one — accepted knowingly, in exchange for the branch topology itself demonstrating a complete release-management model. Pre-push adds a few seconds to every push (typecheck + test suite) — an intentional cost, proportional to what it prevents, and skippable via `--no-verify` when genuinely appropriate.

---

### ADR-X3: CI/CD Strategy — GitHub Actions

**Context.** Automated quality gates are needed for both repositories, as the remote-enforced counterpart to the local pre-commit pipeline in ADR-X2 — the hooks catch problems before a push; CI catches anything that slipped through (for example, a contributor who used `--no-verify`, or an environment difference between a local machine and CI).

**Backend CI:**

```yaml
on: [push, pull_request]
jobs:
  ci:
    steps:
      - Checkout
      - Setup Node (current LTS — see §5)
      - Install dependencies
      - Lint (ESLint)
      - Type check (tsc --noEmit)
      - Test (Vitest) — includes BinancePairResolver and PressureCalculator unit tests against fixture data
      - Build (tsc)
      - Docker build (verifies the Dockerfile)
```

**Mobile CI:**

```yaml
on: [push, pull_request]
jobs:
  ci:
    steps:
      - Checkout
      - Setup Node (current LTS — see §5)
      - Install dependencies
      - Verify src/contracts/schemas.ts matches the backend's source of truth
        (raw-URL diff check — ADR-X1; no auth, no registry)
      - Lint (ESLint)
      - Type check (tsc --noEmit)
      - Test (Jest)
      - Expo Doctor (configuration verification)
      - expo prebuild + expo run:android build check (no EAS dependency)
```

**Rationale.** Automated checks catch issues before merge and demonstrate the CI/CD discipline the role calls for; each step maps to a specific risk this document has already named (contract drift, type errors, regressions, a broken native build). The backend has no contracts-check step of its own, since it is the source of truth the mobile repository checks itself against, not the other way around.

**Trade-offs accepted.** CI run time — kept short and proportionate to this project's scope.

---

### ADR-X4: Deployment Strategy — Docker for the Backend

**Context.** The backend needs to run identically across a local machine, CI, and a container orchestrator.

**Decision.** A multi-stage Docker build, run via `docker-compose` locally.

```dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
USER nodejs
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

```yaml
# docker-compose.yml
services:
  backend:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - BROADCAST_INTERVAL_MS=100
      - EXTRA_PAIRS_COUNT=3
      - PAIR_RESOLUTION_TIMEOUT_MS=5000
      - ORDER_BOOK_PRESSURE_DEPTH=10
    restart: unless-stopped
```

*(No top-level `version:` key — deprecated in the current Compose spec; modern Compose ignores/warns on it. Base image uses `node:24-alpine` — see §5 for why Node 24 specifically.)*

**Rationale.**

1. A non-root user and a minimal base image are standard container-security practice.
2. A multi-stage build keeps the runtime image lean — build tooling never ships in the final image.
3. This is also the natural on-ramp to the AWS/Kubernetes deployment context the role describes, without building infrastructure beyond what this exercise can meaningfully demonstrate. Unlike the contracts-package decision above, adopting Docker here doesn't introduce any install-time risk for a reviewer — `npm run dev` still works standalone, with or without Docker — so there was no corresponding reason to simplify it away.

**Trade-offs accepted.** One additional file to maintain, in exchange for a portable, reproducible runtime.

---

### ADR-X5: Framework Scaffolding & the Human/AI Division of Labor

**Context.** This project is built with AI-assisted development throughout (§7), which
raises a specific question the assignment itself flags as something it's evaluating —
"how effectively you leverage AI" — namely: which parts of the work should an AI coding
session do directly, and which parts should the developer do themselves and hand off a
verified result? Framework scaffolding (generating the initial Fastify project, generating
the initial Expo project, running `expo prebuild` to produce the native `android/`/`ios/`
directories) is exactly this kind of boundary case — an AI session *could* hand-write a
`package.json`, a `tsconfig.json`, and an `app.json` that approximate what the official
generator produces, but "approximate" is the operative risk: official scaffolding tools
encode a large number of framework-specific, version-specific, and platform-specific
details (correct peer dependency ranges, correct native project structure, correct default
configuration) that are easy to get subtly wrong by hand, and a subtle scaffold error is a
worse failure mode than a slower start, because it surfaces later as a confusing build
failure rather than an immediate, obvious one.

**Decision.** Every framework/project-structure scaffolding step is run **manually, by the
developer, in their own terminal, using each framework's official setup command** —
never generated or approximated by an AI coding session. This applies specifically to:

- Backend: the initial Fastify project generation (`npm init fastify` or the current
  equivalent per Fastify's own getting-started docs — confirm the exact invocation against
  those docs at scaffold time, consistent with this document's existing discipline of not
  trusting a possibly-stale remembered command; see §5's versioning note for the same
  reasoning applied to package versions).
- Mobile: `npx create-expo-app@latest` (or the current equivalent per Expo's own docs) for
  initial project generation, and `npx expo prebuild` for generating the native
  `android/`/`ios/` directories (ADR-M1).
- Any future equivalent: if a new top-level framework or native module is ever introduced
  that has its own official generator/installer, that generator is run manually too — this
  is a standing rule, not a one-time exception for the two cases above.

**What this does *not* cover.** Routine dependency installation during feature
implementation — adding `zustand`, `i18next`, a testing library, or any other package a
spec calls for — is normal implementation work, not "creating the framework or project
structure," and an AI coding session may run these (`npm install`, or `npx expo install`
for native-code packages per §5's install rule) as part of building a spec'd feature. The
boundary is specifically the *initial scaffold* — the moment a project's foundational
structure and configuration come into existence — not every subsequent `npm install`
across the project's lifetime. If this boundary should be drawn differently (for example,
requiring every dependency install to be run manually too), that's a call for the developer
to make explicitly — this document states the assumption plainly so it can be corrected
rather than silently guessed.

**Workflow.** Concretely: the developer runs the official scaffold command themselves,
inspects and runs the generated project to confirm it actually builds/starts correctly,
commits that verified scaffold, and only then directs an AI coding session (working from
the specs in `specs/` and the constraints in `CLAUDE.md`) to implement PulseCrypto's actual
requirements on top of it. An AI session encountering an empty or not-yet-scaffolded repo
should stop and say so, rather than generate scaffold files itself to "get started."

**Rationale.**

1. **Correctness of the foundation matters more than speed to a first file.** A framework
   scaffold generated by its own official tooling is verified-correct by construction — the
   generator is maintained by the framework's own team specifically to produce a working
   starting point. A hand-authored approximation carries a real, if usually small, risk of
   a subtly wrong configuration that costs more time to debug later than the generator
   would have taken to run.
2. **This keeps the human explicitly in the loop at the one point where "AI moved fast and
   got it slightly wrong" is hardest to catch quickly** — a wrong dependency version or
   native config option inside a scaffold doesn't fail loudly the way a wrong business-logic
   implementation usually does; it tends to surface later as an unrelated-looking build
   error. Requiring a human-run, human-verified scaffold removes this specific failure mode
   entirely rather than mitigating it.
3. **Directly answers the assignment's own evaluation criterion** — "how effectively you
   leverage AI" is demonstrated as much by knowing where *not* to delegate to AI as by using
   it well everywhere else; this is the same judgment already exercised elsewhere in this
   document (see the Executive Summary's "complexity is added deliberately, in both
   directions" principle) applied to the human/AI boundary specifically, rather than only to
   architectural complexity.

**Trade-offs accepted.** A slower start for each repository (the developer runs a command
and waits, rather than an AI session generating equivalent files instantly) — a small,
one-time cost per repository, accepted deliberately in exchange for removing scaffold-
correctness as a category of risk for the rest of the build.

---

## 5. Technology Stack Summary

**Every version below was checked against a current source as of this document's date, not assumed from prior knowledge** — several of these ecosystems move fast enough that a stale guess would have undercut the point of specifying versions at all. Exact patch releases still shift between now and actual implementation; run `npm view <package> version` immediately before scaffolding to confirm the latest patch within the stated major/minor line.

**Install rule for anything with native code:** for `react-native-reanimated`, `react-native-mmkv`, `expo-localization`, and any future native module, install via `npx expo install <package>` rather than plain `npm install`. Expo resolves the specific version known-compatible with the installed SDK automatically — this matters more than for a typical npm package, because an incompatible native-module version can fail at build time in a way plain semver ranges won't catch.

### Backend

| Concern          | Choice                                                                                                                 | Current version (verified)                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime          | Node.js                                                                                                                | **24.x (Active LTS)** — Node 24 is the current Active LTS line; Node 22 is now in maintenance-only mode                                             |
| Language         | TypeScript                                                                                                             | **5.9.x**                                                                                                                                            |
| HTTP framework   | Fastify                                                                                                                | **5.6.x**                                                                                                                                            |
| WebSocket        | `ws`                                                                                                                 | 8.x (stable, long-running major — confirm exact minor at scaffold)                                                                                        |
| Validation       | Zod                                                                                                                    | 4.x (Zod 4 is current; confirm at scaffold — schema syntax changed from Zod 3, so this is worth checking deliberately rather than assuming compatibility) |
| Contracts        | `contracts/` folder within this repo — the source of truth, mirrored (not published) by the mobile repo; see ADR-X1 | —                                                                                                                                                         |
| Config           | dotenv + Zod                                                                                                           | —                                                                                                                                                         |
| Logging          | pino                                                                                                                   | 9.x                                                                                                                                                        |
| Metrics          | prom-client                                                                                                            | 15.x                                                                                                                                                       |
| Testing          | Vitest                                                                                                                 | 3.x                                                                                                                                                        |
| Linting          | ESLint (flat config) + Prettier                                                                                        | **ESLint 9.39.x**, Prettier 3.6.x                                                                                                                    |
| Containerization | Docker,`node:24-alpine` base image                                                                                   | —                                                                                                                                                         |

### Mobile

| Concern            | Choice                                                                                          | Current version (verified)                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | Expo (Dev Client / Prebuild)                                                                    | **SDK 57** (React Native 0.86, React 19.2) — see the callout below; SDK 58 is in beta as of this writing and not yet the stable recommendation |
| Language           | TypeScript                                                                                      | 5.9.x (same as backend)                                                                                                                               |
| Navigation         | React Navigation (Native Stack)                                                                 | 7.x                                                                                                                                                   |
| State — real-time | Zustand                                                                                         | 5.x                                                                                                                                                   |
| State — REST      | TanStack Query                                                                                  | **5.102.x**                                                                                                                                     |
| List rendering     | FlashList                                                                                       | v2.x                                                                                                                                                  |
| Animation          | react-native-reanimated                                                                         | See callout below — install via`npx expo install`, do not pin an independent version                                                               |
| Persistence        | MMKV                                                                                            | `react-native-mmkv` 3.x — install via `npx expo install`                                                                                         |
| WebSocket          | Custom hook, native WebSocket API, broadcast-silence liveness (no separate heartbeat — ADR-M6) | —                                                                                                                                                    |
| HTTP               | fetch (built-in)                                                                                | —                                                                                                                                                    |
| Localization       | `i18next` + `react-i18next`, `expo-localization` — ADR-M9                                | Install`expo-localization` via `npx expo install`; `i18next`/`react-i18next` via plain `npm install` (pure JS, no native code)              |
| Contracts          | Local mirrored copy of the backend's`contracts/`, verified by CI diff check; see ADR-X1       | —                                                                                                                                                    |
| Testing            | Jest + React Native Testing Library                                                             | Jest 30.x, RNTL 13.x                                                                                                                                  |
| Linting            | ESLint + Prettier                                                                               | Same as backend                                                                                                                                       |

> **Callout — why the exact Expo SDK matters more than usual here.** Expo SDK 56 shipped with a known Hermes V1 memory regression that specifically affects apps importing `react-native-worklets` or `react-native-reanimated` — precisely the animation library ADR-M4 selects. This is resolved in SDK 57 (patched further in `expo@57.0.17`). **This project should scaffold on SDK 57, not 56**, and this isn't a cosmetic version choice — building on the affected SDK would introduce a real, documented memory issue directly into the one library most responsible for the app's core performance requirement (smooth animation under sustained updates). Re-check this specific regression's status before upgrading further if SDK 58 has stabilized by the time implementation begins.

### Backend Environment Variables

| Variable                       | Default                                      | Purpose                                                                                                                   |
| ------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `REQUIRED_PAIRS`             | `BTCUSDT,ETHUSDT,SOLUSDT,DOGEUSDT,XRPUSDT` | Always-included, mandatory pairs                                                                                          |
| `EXTRA_PAIRS_COUNT`          | `3`                                        | Additional pairs resolved by live liquidity                                                                               |
| `PAIR_RESOLUTION_TIMEOUT_MS` | `5000`                                     | Timeout before falling back to required pairs only                                                                        |
| `ORDER_BOOK_PRESSURE_DEPTH`  | `10`                                       | Order book levels used in the pressure calculation (ADR-B5) — deliberately decoupled from the Binance subscription depth |
| `BROADCAST_INTERVAL_MS`      | `100`                                      | Conflation tick / broadcast interval — also the basis for the mobile client's liveness timeout (ADR-M6)                  |
| `MAX_BUFFERED_BYTES`         | `65536`                                    | Per-client backpressure threshold                                                                                         |
| `MAX_CONSECUTIVE_SKIPS`      | `10`                                       | Ticks a client can be skipped before eviction                                                                             |

---

## 6. Delivery Plan

### Phase 0 — Setup & Contracts

- Review the Figma reference (see "Reference Materials" above) end to end before writing any UI code — including opening it in Dev Mode/Inspect to pull real design tokens, not just for layout impressions
- Create the two repositories: backend, mobile
- **Scaffold each project manually, using each framework's official setup command, per ADR-X5 — not generated by an AI coding session.** Run the backend's Fastify generator, and the mobile app's `create-expo-app` + `expo prebuild`, confirm each starts/builds correctly, and commit the verified scaffold *before* handing either repo to an AI coding session for feature implementation
- Establish `contracts/` in the backend repo with initial schemas, including `SupportedPairsMeta`
- Mirror the same files into mobile's `src/contracts/`, and set up the CI diff check (ADR-X1) from day one, so drift is caught immediately rather than retrofitted later
- Configure tooling in both repos: ESLint, Prettier, and the full three-stage Husky pipeline (`pre-commit`, `commit-msg`, `pre-push` — ADR-X2)
- Write specs before any implementation code (§7)

### Phase 1 — Backend: Data Ingestion

- `BinancePairResolver`: exchangeInfo + 24hr ticker query, filtering, ranking, fallback logic, unit tests
- Binance WebSocket client, built from the resolved pair list
- Stream parser and normalizer
- In-memory per-pair state store
- Conflation engine (100ms tick)
- `PressureCalculator` implementation and unit tests against fixture order books

### Phase 2 — Backend: API & Broadcasting

- WebSocket server (`ws`)
- Client registry with the single-mechanism backpressure design (ADR-B4)
- Broadcast engine
- `GET /pairs/meta` (real data, mock fallback, 60s cache, scoped to resolved pairs)
- `GET /health`
- `GET /metrics`, including the `supported_pairs_count` gauge
- Integration tests

### Phase 3 — Mobile: Foundation

- (Scaffolding itself already done manually in Phase 0, per ADR-X5, on Expo SDK 57 specifically — see §5 callout. This phase builds on that verified scaffold.)
- Navigation setup
- `core/` scaffolding: shared models, `IMarketRepository`, shared components, theme, `src/contracts/` mirror
- `core/i18n/` setup: i18next init, `expo-localization` device-detection, English namespace files (ADR-M9)
- Zustand stores (dynamic pair membership in `marketStore`)
- TanStack Query setup for metadata
- `useWebSocket` hook, including reconnection, broadcast-silence liveness detection, and app-state awareness

### Phase 4 — Mobile: Core Features

- `core/theme/` populated from `specs/design-tokens.md` (Figma-API-verified colors/type/spacing/radii — ADR-M10) before any screen is built, so every screen draws from the same source
- `watchlist` feature (the "Markets" screen): screen, FlashList row rendering, search/filter — no Figma frame exists for this one; built fresh from `design-tokens.md`
- `favourites` feature: toggle, persistence, public `useFavourites()` hook, untracked-favourite handling in `watchlist`
- `market-details` feature (the "Terminal" screen): price ticker, order book, market depth panel — built to Figma's "Trading Terminal" frame at full fidelity, with buy/sell pressure, spread, and **last updated timestamp** added on top per ADR-M10 since Figma doesn't show them
- `telemetry-settings` feature (the "Telemetry & Settings" screen) + the account drawer: built to Figma at full fidelity — not an assignment requirement, built per the explicit ADR-M10 decision; real data wired where cheap (WS msg rate, JS FPS), everything else clearly documented as display-only
- Price-flash and order-book animations
- All user-facing strings routed through `react-i18next`, not hardcoded inline — enforced from this phase onward, not retrofitted later

### Phase 5 — Mobile: Resilience & Performance

- Offline detection and stale-data display
- Auto-reconnect with exponential backoff
- Pull-to-refresh
- Connection-status indicator
- Backgrounding / network-switching edge cases
- Incoming WS message validation against the mirrored contract schema, and the top-level error boundary (ADR-M6, v8.1)
- Performance profiling, including a measured FlashList-vs-FlatList comparison for the README
- **Build and run on the Android Emulator via `npx expo run:android`, and confirm it end-to-end** — the assignment's required target platform; this should happen well before Phase 7's screen recording, not for the first time during it

### Phase 6 — Testing & Polish

- Backend unit tests, including `BinancePairResolver` (success, fallback, and exclusion-filter paths) and `PressureCalculator`
- Backend integration tests
- Mobile unit and component tests, including the `watchlist`/`favourites` merge logic and locale-aware formatting utilities
- Docker verification
- CI for both repositories, including the mandatory contracts-drift check

### Phase 7 — Documentation & Delivery

- README (setup, architecture, ADRs, trade-offs, AI usage, pair-resolution strategy, localization approach)
- Screen recording
- Code cleanup
- Tagged release

*The above is a target sequence, not a fixed commitment — mobile native-build friction, even on Expo, tends to consume unpredictable time regardless of planning.*

---

## 7. Development Workflow — Spec-Driven Development

Specs are written before implementation, and used as the input for AI-assisted implementation work, rather than writing code first and documenting after the fact.

**Spec files:**

- `specs/api-contract.md` — REST and WebSocket payload schemas, mirroring `contracts/schemas.ts`
- `specs/data-models.md` — TypeScript interfaces
- `specs/buffering-strategy.md` — conflation and backpressure design (ADR-B4)
- `specs/pressure-spread-formula.md` — the exact formulas from ADR-B5, with worked examples against a fixture order book
- `specs/pair-resolution-strategy.md` — the required-pairs guarantee, ranking logic, exclusion rules, and fallback behavior (ADR-B3)
- `specs/mobile-screens.md` — screen-level behavior specs, referencing the Figma mockup for layout
- `specs/offline-behavior.md` — the connection state machine, including the broadcast-silence liveness threshold (ADR-M6, ADR-M7)
- `specs/localization.md` — namespace structure, formatting rules, the device-locale/manual-override precedence (ADR-M9)

**Workflow:**

1. Write the spec for a unit of work.
2. Provide the spec as context to the AI coding tool (for example, "implement `ConflationEngine` against this spec," or "implement `BinancePairResolver` including the fallback path").
3. Review the generated output against the spec's stated behavior, not just against whether it runs.
4. Write tests derived from the spec's stated behavior, not from the implementation as written.
5. Document how the tool was used, per feature, in the README.

**Code quality gates.** ESLint 9 (flat config) + Prettier, TypeScript strict mode, the full pre-commit/commit-msg/pre-push Husky pipeline (ADR-X2), Conventional Commits enforced, and no PR merges without CI passing — including the contracts-drift check.

---

## 8. Testing Strategy

| Layer               | Tool                         | What's covered                                                                                                                                                                                                                                                                                                 |
| ------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend unit        | Vitest                       | `ConflationEngine`, `PressureCalculator` (the exact formulas from ADR-B5), message parsing, eviction logic, `BinancePairResolver` (required pairs always present; leveraged/stablecoin symbols excluded; fallback triggers correctly on timeout or error) — all with ports mocked                       |
| Backend integration | Vitest +`ws` client        | REST contract, WebSocket broadcast, mock Binance adapter, startup behavior against a deliberately failing exchangeInfo endpoint (verifies graceful fallback)                                                                                                                                                   |
| Mobile unit         | Jest                         | Zustand stores (including dynamic pair membership), mappers, utilities (including locale-aware`formatPrice`/`formatPercent`), `core/` and `favourites/` repository implementations against mocked sources, the `useWebSocket` broadcast-silence timeout logic                                        |
| Mobile component    | React Native Testing Library | `PairRow`, price-flash behavior, `ConnectionIndicator`, `LastUpdatedLabel`, `UntrackedFavouriteBadge`, the `watchlist`/`favourites` merge logic, and that key screens render correctly with the i18n provider mocked to a non-English locale (catches hardcoded strings that bypassed translation) |

---

## 9. README Content Plan

**Setup instructions.** Prerequisites (Node.js, Android Studio, Xcode), backend setup (environment variables, Docker), mobile setup (`npx expo prebuild`), a note that all screens follow the Figma reference linked at the top of this document.

**Build and run instructions.** Backend via `npm run dev` or `docker-compose up`; mobile via `npx expo prebuild && npx expo run:android` (or `expo start` for JS-only iteration against an existing development build).

**Architectural decisions.** A summary of the ADRs in this document, with rationale and trade-offs.

**Assumptions made.** Binance's public API is reachable; the mobile app and backend share a network during local development; five required pairs satisfy the assignment's mandatory scope; English is the only shipped translation, with the localization infrastructure in place to add more.

**Trade-offs considered.**

- Expo (Dev Client) over bare React Native CLI, with the supporting evidence stated on both sides, not an unqualified assertion
- A CI-enforced mirrored `contracts/` folder over both a published package (removes a real install-time authentication risk — ADR-X1) and plain undocumented duplication (removes the silent-drift risk)
- Zustand + TanStack Query over a single state-management library, including why TanStack Query earns its place with only one REST endpoint today
- FlashList over FlatList, including the disclosed maintenance-continuity note, stated consistently everywhere the choice is discussed
- Latest-state conflation with a single backpressure mechanism, over a delta queue or multiple overlapping safeguards
- Broadcast-silence liveness detection over a dedicated WebSocket heartbeat protocol
- Feature-first mobile architecture with a small shared `core/` layer, over both pure layer-first and pure feature-first-flat alternatives
- Dynamic, liquidity-based pair resolution over a hand-picked list, including the fallback behavior if resolution fails
- Building the full localization mechanism up front, while shipping only one language today

**AI-assisted development.** Which tools were used, how (spec-driven, per the workflow in §7), what was AI-generated versus manually written, and how output was reviewed against each spec's stated behavior.

---

## 10. Deliverables — Mapped to the Assignment Brief

### 1. Complete Source Code

Shared via Git repositories:

- `pulsecrypto-backend` (includes `contracts/`, the source of truth for the wire format)
- `pulsecrypto-mobile`

### 2. Screen Recording

Demonstrating:

- Market watchlist with live updates, matching the Figma reference
- Search/filter functionality
- Favourites persistence, including the untracked-favourite state rendering correctly
- Market details: price, buy/sell pressure, spread, order book, last updated timestamp
- Price-flash and order-book volume animations
- Offline behaviour and auto-reconnection
- Pull-to-refresh
- The dynamically-resolved additional pairs alongside the required five

### 3. README

Covering setup, build/run instructions, architectural decisions with rationale and trade-offs, assumptions made, and how AI-assisted development tools were used — the full content plan for this is in §9.

---

## 11. Final Pre-Submission Checklist

- [ ] Backend connects to Binance via the combined stream (depth + ticker), built from the resolved pair list
- [ ] The five required pairs are always included, regardless of pair-resolution outcome
- [ ] Additional pairs are resolved dynamically by live 24h quote volume, excluding leveraged/synthetic tokens and stablecoin-to-stablecoin pairs
- [ ] Pair resolution falls back gracefully to the required five if Binance is unreachable or times out at startup
- [ ] Updates are buffered/batched at a configurable interval (100ms default)
- [ ] Slow-consumer memory growth is prevented via a single, documented backpressure mechanism
- [ ] Buy Pressure, Sell Pressure, and Spread are computed using the documented formulas (ADR-B5), with `ORDER_BOOK_PRESSURE_DEPTH` as a named, configurable constant, and covered by unit tests against fixture data
- [ ] The WebSocket server broadcasts to connected mobile clients
- [ ] `GET /pairs/meta` returns real data with a documented, correctly-scoped mock fallback
- [ ] The mobile repo's mirrored `src/contracts/` matches the backend repo's `contracts/` source of truth; the CI diff check passes
- [ ] The mobile watchlist renders every currently-tracked pair, with no hardcoded count assumption
- [ ] Each row shows trading pair, current price, 24h change, connection indicator, favourite toggle
- [ ] Search/filter works
- [ ] Favourites persist locally, and a favourited-but-currently-untracked pair is handled gracefully via `UntrackedFavouriteBadge`, obtained through `favourites`'s public hook rather than reaching into its internals — never hidden or crashing
- [ ] Market Details shows price, buy/sell pressure, spread, order book, and **last updated timestamp**
- [ ] `lastUpdatedAt` reflects the backend's conflation-tick time, is passed through unmodified to `marketStore`, and renders via `LastUpdatedLabel` in a locale-aware format
- [ ] The mobile client detects a dead connection via broadcast silence (no separate heartbeat messages sent or expected)
- [ ] The UI remains smooth under sustained updates (price flash, order book animation both verified under load)
- [ ] Offline behavior is correct: stale data remains visible, connection status is shown, reconnection is automatic
- [ ] Pull-to-refresh works without interrupting the live WebSocket stream
- [ ] Every user-facing string is routed through `react-i18next` — no hardcoded English text bypassing the translation layer; verified by rendering key screens under a non-English locale in mobile component tests
- [ ] Price and percentage formatting uses `Intl.NumberFormat` respecting the active locale, not a hardcoded formatting convention
- [ ] The full Husky pipeline (pre-commit, commit-msg, pre-push) is installed and functioning identically in both repositories
- [ ] Dependency direction matches the stated architecture in both repositories — spot-check that nothing in the backend's `domain/` imports from `infrastructure/` or `data/`, and that no mobile feature reaches into another feature's internals rather than its barrel export
- [ ] Unit and integration tests are present and passing, including pair-resolver and pressure-calculator coverage
- [ ] Implemented screens match the Figma mockup referenced at the top of this document — including the "Terminal" and "Telemetry & Settings" screens and account drawer, built at full fidelity per ADR-M10, and the freshly-designed "Markets" screen visually consistent with `design-tokens.md`
- [ ] Every screen draws colors/type/spacing from `core/theme/` (sourced from `specs/design-tokens.md`), not a hardcoded literal — including the Markets screen, which has no Figma frame to check against
- [ ] Telemetry & Settings' non-backed controls (throttling slider/toggles) and the account drawer's account-management links are documented in the README as intentionally display-only (ADR-M10) — not left for a reviewer to discover unexplained
- [ ] Telemetry's WS message-rate (and, if implemented, JS-thread FPS) reflect real measured values, not static mockups
- [ ] The README is complete (setup, architecture, ADRs, trade-offs, AI usage, pair-resolution strategy, localization approach) and any claim about a third party's technology choices is stated consistently everywhere it appears in the document
- [ ] Screen recording demonstrates the required functionality, ideally including the dynamically-resolved additional pairs alongside the required five
- [ ] **The mobile app was built and run on the Android Emulator via `npx expo run:android`, and the screen recording is captured from that build** — this is the assignment's explicit, required target platform (§1 "Technology Requirements"); iOS Simulator is optional and does not substitute for it
- [ ] Docker build and run succeed for the backend
- [ ] CI passes on both repositories, including the mandatory contracts-drift check
- [ ] All package versions were verified against `npm view <package> version` at scaffold time, not assumed from this document's snapshot (§5)
- [ ] Both project scaffolds (`npm init fastify`/equivalent for the backend, `create-expo-app` + `expo prebuild` for mobile) were generated via each framework's official CLI, run manually by the developer and verified running before any feature implementation began (ADR-X5) — not hand-authored by an AI coding session
- [ ] Incoming WebSocket messages are validated against the mirrored contract schema before reaching `marketStore`, and a malformed message is dropped and logged rather than crashing the app (ADR-M6, v8.1)
- [ ] The mobile app has a top-level error boundary with a recoverable fallback screen, not a raw crash, on a rendering error (ADR-M6, v8.1)

---

## 12. Implementation Notes — Precision Details

Six points worth a final, explicit check during implementation — each is already covered by an ADR above, and each is small enough to be easy to get subtly wrong without a direct check like this one.

**1. Pressure and spread must match the documented formula exactly.**
The formulas are specified in full in ADR-B5 and should be transcribed into `specs/pressure-spread-formula.md` and `PressureCalculator.ts` without deviation: `Spread = lowest_ask − highest_bid`; `Buy Pressure % = (bid_volume_top_N / (bid_volume_top_N + ask_volume_top_N)) × 100`; `Sell Pressure % = 100 − Buy Pressure %`, with `N` sourced from the named `ORDER_BOOK_PRESSURE_DEPTH` constant, not a literal number. Keeping the calculation deterministic and the formula documented is what makes it possible to unit test with an exact expected result.

**2. `lastUpdatedAt` must reflect processing time, not upstream message time.**
Per ADR-B4, the backend stamps each conflated snapshot with the conflation tick's own timestamp — not the raw timestamp on the incoming Binance message. On the mobile side, `marketStore.updatePair` should set this field directly from the incoming payload, with no client-side recomputation, so `LastUpdatedLabel` always renders a value with a single source of truth.

**3. Untracked favourites must render, not disappear — and must not require reaching into another feature's internals.**
Per ADR-M8, `WatchlistScreen` renders every favourited pair regardless of `getTrackedPairs()` membership, obtaining the favourites list exclusively through `features/favourites`'s exported `useFavourites()` hook. A favourited pair outside the current tracked set shows `core/components/UntrackedFavouriteBadge` with a localized label, rather than being silently hidden from the list or causing a rendering error.

**4. The contracts drift check should stay deliberately simple, and needs no authentication anywhere in its path.**
Per ADR-X1, mobile's CI job fetches `contracts/schemas.ts` from the backend repository's raw GitHub URL and diffs it against the local mirrored copy at `src/contracts/schemas.ts`, failing the build on any difference. No package registry, no personal access token, no publish step — this is what makes the check something a reviewer's own `npm install` will never trip over.

**5. There is no server-side or client-side heartbeat/ping-pong message anywhere in this system, by design.**
Per ADR-M6, connection liveness on the mobile side is inferred from the backend's own broadcast cadence: if no message has arrived within `STALE_CONNECTION_TIMEOUT_MS` (a documented multiple of `BROADCAST_INTERVAL_MS`), the connection is treated as dead. If an implementation session (AI-assisted or otherwise) adds a separate ping/pong exchange, that's scope creep relative to this spec, not a missing feature — the broadcast stream already carries the liveness signal.

**6. Scaffold on Expo SDK 57, not SDK 56, and not on whatever the newest beta happens to be at implementation time without re-checking.**
Per §5, SDK 56 has a known Hermes memory regression affecting `react-native-reanimated` specifically — the exact library this app depends on for its core animation requirement (ADR-M4). SDK 58 was in beta, not stable, as of this document's date; if it has stabilized by the time implementation begins, re-verify this regression's status and the SDK 58 migration notes before assuming it's a safe default rather than assuming SDK 57 is still current.

---

## 13. Document History

| Version       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0           | Initial Architecture Decision Record — backend and mobile design, dynamic pair resolution, cross-cutting repository/CI/deployment strategy, delivery plan, testing approach.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2.0           | Added TanStack Query alongside Zustand for REST state management (ADR-M2 expanded), establishing the client/server-state boundary, and strengthened the rationale for dual state-management tools as an architectural boundary rather than a today-only justification. Introduced ADR-B8 (Observability Strategy) with `pino` structured logging and `prom-client` metrics, including a `pulsecrypto_supported_pairs_count` gauge to make dynamic pair resolution observable in production.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3.0           | Simplified ADR-B4 (Backpressure Strategy) after review identified redundant complexity. Removed the layered bounded per-client message queue plus time-based lag timeout, replacing both with a single-mechanism design: a `ws.bufferedAmount` check with consecutive-skip eviction as the sole backpressure signal, reducing the thresholds to reason about from two independent values to one. Documented the simplification rationale that complexity is added deliberately, in both directions — including knowing when to remove layers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4.0           | Revised ADR-M8 (Mobile Project Structure) from layer-first organization (`src/domain`, `src/data`, `src/presentation`) to feature-first architecture with internal layering. Added a small, deliberately-scoped shared `core/` layer for genuinely cross-feature concerns, governed by an explicit "two-or-more-features test" for membership, and introduced a barrel-export convention (`features/*/index.ts`) for feature boundaries. Moved `IMarketRepository` to `core/domain/repositories/` since both the watchlist and market-details features depend on it, while `IFavouritesRepository` stayed in `features/favourites/domain/` as only one feature needs it; added `UntrackedFavouriteBadge` to `core/components/` as a generic, reusable indicator. Strengthened the scalability rationale: adding new features requires touching only one feature folder.                                                                                                                                                                                                       |
| 5.0           | Consolidated version. Corrected an inconsistency where FlashList's maintenance-continuity disclosure appeared in one ADR but not in the Expo/React Native decision it bears on most directly. Fully specified the backend's hexagonal architecture with an explicit folder structure and dependency rule. Revised the mobile project structure from layer-first to feature-first with internal layering, adding a small shared`core/` layer and a barrel-export convention. Restored `ORDER_BOOK_PRESSURE_DEPTH` as a named constant.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 6.0           | Repository strategy revised from three repositories (backend, mobile, and a published`@pulsecrypto/contracts` package) to two, after discovering GitHub Packages requires authentication to install even a public package. Replaced with a CI-enforced mirrored `contracts/` folder. Removed a redundant WebSocket heartbeat, replaced with broadcast-silence liveness detection derived from the backend's existing cadence. Retained and strengthened the rationale for TanStack Query as a deliberate forward-looking architectural boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 7.0           | All technology stack versions verified against current sources as of this document's date and updated accordingly (Node.js 24 LTS, TypeScript 5.9, Fastify 5.6, Expo SDK 57/React Native 0.86, TanStack Query 5.102, ESLint 9.39, among others), including a specific, non-cosmetic finding: Expo SDK 56 carries a known Hermes memory regression affecting `react-native-reanimated`, making SDK 57 the correct scaffold target rather than SDK 56. Added ADR-M9 (Internationalization Strategy): `i18next` + `react-i18next` + `expo-localization`, structured from the start of the project rather than retrofitted, shipping with English as the only complete translation initially. Expanded ADR-X2 into a fully specified three-stage pre-commit hook pipeline (`pre-commit` / `commit-msg` / `pre-push`) applied identically to both repositories. Added a "Reference Materials" section surfacing the Figma UI/UX mockup as the explicit visual source of truth, cross-referenced from the delivery plan, README plan, and final checklist. |
| 8.0           | Revised ADR-X2 from GitHub Flow to Gitflow (persistent `develop` integration branch, `feature/*`/`release/*`/`hotfix/*` branches, `main` reserved for tagged releases only) — a deliberate reversal of v7.0's stated position, made explicitly because this is an evaluated exercise where a fully worked branch topology is itself a demonstrable engineering-process artifact, not because the original "disproportionate for a solo project" argument was wrong on its own terms. Both repos' `CLAUDE.md` and branching instructions updated to match. |
| 8.1           | Re-verified this document against the assignment PDF and found two concrete gaps, now closed: (1) nothing gated on the assignment's explicit "must run on Android Emulator (required)" requirement — added to the Final Checklist and Phase 5/7 of the delivery plan; (2) the "appropriate error handling" non-functional requirement had no concrete mobile-side mechanism — added incoming-WebSocket-message validation against the mirrored contract schema, and a top-level React error boundary, to ADR-M6. Added ADR-X5 (Framework Scaffolding & the Human/AI Division of Labor): every framework/project-structure scaffold (Fastify generator, `create-expo-app`, `expo prebuild`) is run manually by the developer using each framework's official setup command, verified running, and committed *before* an AI coding session begins feature work on top of it — routine dependency installs during feature implementation are unaffected by this boundary. Confirmed (again) that this planning session has no live Figma access — no design tokens are asserted anywhere in this document or its mirrored specs; screens must be built by consulting the Figma link directly. |
| **8.2** | **Final.** Gained live Figma access via a developer-provided personal access token and the Figma REST API, and used it to verify — rather than assume — the mockup's actual content. Found a real gap: the file's two designed screens ("Trading Terminal," "Telemetry & Settings") don't map one-to-one onto the assignment's four required screens — no watchlist is mocked, while an account-management drawer and a developer telemetry dashboard (neither required by the assignment) are fully designed. Presented to the developer as an explicit choice rather than resolved unilaterally; decision made: build everything Figma provides at full fidelity, including the out-of-scope content, and design the missing Markets/Watchlist screen fresh in the same verified visual language. Added ADR-M10 (Mobile Design System & Screen Scope) recording this decision, the real extracted design tokens (colors, typography, spacing, radii — all traced to source nodes, not estimated), and which Figma-sourced controls get real data (WS message rate, JS-thread FPS) vs. display-only treatment (throttling controls, account-management links) given neither has backend support. Updated the "Reference Materials" section, the Phase 4 delivery plan, and the Final Checklist to match. `pulsecrypto-mobile/specs/design-tokens.md` and a substantially revised `specs/mobile-screens.md` carry the full detail. |

---

*This document is maintained alongside the codebase. Where an implementation decision diverges from what's recorded here, the divergence and its reason should be added as a note under the relevant ADR, not left undocumented. This version is intended as the working specification for AI-assisted implementation (Claude Code or equivalent) going forward — each ADR is written to be actionable as a task brief on its own.*
