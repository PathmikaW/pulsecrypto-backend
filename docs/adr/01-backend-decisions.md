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

