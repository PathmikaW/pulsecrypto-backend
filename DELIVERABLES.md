# PulseCrypto — Deliverables & Requirements Map

One page that maps every item in the assignment to a short description and to where it lives in the code.
This file is identical in both repositories; all links are absolute so they work from either one.

| Repository                | What it is                                                                         | Link                                                       |
| ------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **`pulsecrypto-backend`** | Node.js + TypeScript + Fastify service: Binance ingestion, WebSocket gateway, REST | [GitHub](https://github.com/PathmikaW/pulsecrypto-backend) |
| **`pulsecrypto-mobile`**  | React Native (Expo) app for Android: watchlist, terminal, telemetry                | [GitHub](https://github.com/PathmikaW/pulsecrypto-mobile)  |

**Jump to:** [Screen recordings and APK](#1-screen-recordings-and-installable-apk) · [Architectural decisions (ADRs)](#2-architectural-decisions-adrs) ·
[README deliverables](#3-readme-deliverables) · [Backend requirements](#4-functional-requirements--part-1-backend) ·
[Mobile requirements](#5-functional-requirements--part-2-mobile) · [Non-functional](#6-non-functional-requirements) ·
[Technology](#7-technology-requirements) · [Beyond the brief](#8-beyond-the-brief)

---

## 1. Screen recordings and installable APK

Two recordings, kept together in one Google Drive folder: [**PulseCrypto recordings**](https://drive.google.com/drive/folders/1qSjMnxsWlgyiH7tUn3lmEbBVgV9hHWJT?usp=sharing).

| #   | Recording                                                                                                          | Link                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1   | **Mac screen recording — local setup.** Backend running on the Mac, app running on the Android Emulator.           | [Recordings folder](https://drive.google.com/drive/folders/1qSjMnxsWlgyiH7tUn3lmEbBVgV9hHWJT?usp=sharing) |
| 2   | **Real device — hosted backend.** The release APK on a physical Android phone, talking to the Node backend on AWS. | [Recordings folder](https://drive.google.com/drive/folders/1qSjMnxsWlgyiH7tUn3lmEbBVgV9hHWJT?usp=sharing) |

**Installable Android APK (v1.0.0):** [`pulse_crypto_v-1.0.0.apk`](https://drive.google.com/file/d/1z9LeGYG7x3_v1mY9_55HhiiHTHNNvp8A/view?usp=sharing) on Google Drive — the EAS `preview`
release build. It is arm64-only (runs on nearly all current Android phones, not on x86 emulators) and connects to the
hosted backend over `https://`/`wss://`, so it shows live data only while the AWS instance is running. Allow
"Install unknown apps" for the app you open the file from.

What to expect in the recordings, and how to reproduce the setups yourself:

- Recording 1 follows [Setup and Build & run in the mobile README](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/README.md#setup)
  and the [backend README](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/README.md#setup).
- Recording 2 uses the APK built from the EAS `preview` profile ([`eas.json`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/eas.json))
  against `https://pulsecrypto.duckdns.org`. The AWS hosting is described in
  [`docs/deployment-aws-ec2.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/docs/deployment-aws-ec2.md).
  The instance is stopped when not in use, so the hosted backend may be offline outside the recording.

---

## 2. Architectural decisions (ADRs)

Every significant decision is recorded as an ADR: the options considered, the decision, the rationale and the
trade-offs accepted. The ADR is split by topic. Each repository carries the files it needs under `docs/adr/`;
the index is [`00-overview.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/docs/adr/00-overview.md)
(same file in both repos). Both READMEs also have an **Architectural decisions** section that summarises them:
[backend](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/README.md#architectural-decisions) ·
[mobile](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/README.md#architectural-decisions).

### Backend decisions — [`docs/adr/01-backend-decisions.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/docs/adr/01-backend-decisions.md)

| ADR    | Decision                                                                                  |
| ------ | ----------------------------------------------------------------------------------------- |
| ADR-B1 | HTTP framework — Fastify                                                                  |
| ADR-B2 | WebSocket library — `ws`                                                                  |
| ADR-B3 | Binance connection and trading-pair resolution (required five plus extras by live volume) |
| ADR-B4 | Stream processing and backpressure: conflate on a timer, skip and evict slow consumers    |
| ADR-B5 | Buy/sell pressure and spread — deterministic calculation                                  |
| ADR-B6 | Metadata endpoint strategy (`/pairs/meta`)                                                |
| ADR-B7 | Hexagonal architecture with explicit ports                                                |
| ADR-B8 | Observability — structured logs and Prometheus metrics                                    |
| ADR-B9 | Security — defence in depth (validated config, rate limits, CORS and origin checks)       |

### Mobile decisions — [`docs/adr/02-mobile-decisions.md`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/docs/adr/02-mobile-decisions.md)

| ADR     | Decision                                                                        |
| ------- | ------------------------------------------------------------------------------- |
| ADR-M1  | Framework — Expo (Dev Client + prebuild)                                        |
| ADR-M2  | State management — Zustand for the stream, TanStack Query for REST              |
| ADR-M3  | List rendering — FlashList with memoised rows                                   |
| ADR-M4  | Animations — Reanimated on the UI thread                                        |
| ADR-M5  | Local persistence — MMKV                                                        |
| ADR-M6  | WebSocket client — custom hook, backoff with jitter, silence-based liveness     |
| ADR-M7  | Offline strategy — keep stale data, show status, reconnect automatically        |
| ADR-M8  | Project structure — feature-first with a small `core/` layer                    |
| ADR-M9  | Internationalisation — i18next, every string translated                         |
| ADR-M10 | Design system and screen scope — tokens from Figma's API, Watchlist built fresh |
| ADR-M11 | Bottom-tab navigation with focus-gated live data                                |
| ADR-M12 | HTTP client, common error model and retry policy — axios                        |

### Cross-cutting decisions — [`docs/adr/03-cross-cutting-decisions.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/docs/adr/03-cross-cutting-decisions.md)

| ADR    | Decision                                                           |
| ------ | ------------------------------------------------------------------ |
| ADR-X1 | Two repositories with a mirrored, drift-checked contract           |
| ADR-X2 | Gitflow, Conventional Commits and the three-stage Husky pipeline   |
| ADR-X3 | CI/CD strategy (designed, not implemented — stated honestly)       |
| ADR-X4 | Docker multi-stage build for the backend (and the AWS EC2 hosting) |
| ADR-X5 | Framework scaffolding and the human/AI division of labour          |
| ADR-X6 | AI session continuity and verification discipline                  |
| ADR-X7 | ADR structure — split by topic                                     |

### Supporting documents (same folder, in both repos)

| Document                                                                                                                           | What it covers                                     |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| [`04-tech-stack.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/docs/adr/04-tech-stack.md)                         | Installed versions, environment variables          |
| [`05-delivery-plan.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/docs/adr/05-delivery-plan.md)                   | Phases, and what is done and not done              |
| [`06-workflow-and-testing.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/docs/adr/06-workflow-and-testing.md)     | Spec-driven workflow, what the test suites contain |
| [`07-delivery-and-checklist.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/docs/adr/07-delivery-and-checklist.md) | README plan and the final pre-submission checklist |
| [`08-implementation-notes.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/docs/adr/08-implementation-notes.md)     | Easy-to-get-wrong implementation details           |
| [`09-document-history.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/docs/adr/09-document-history.md)             | Version-by-version change log of the ADR           |

Specs (the exact behaviour each unit was built against):
[backend `specs/`](https://github.com/PathmikaW/pulsecrypto-backend/tree/main/specs) ·
[mobile `specs/`](https://github.com/PathmikaW/pulsecrypto-mobile/tree/main/specs).

---

## 3. README deliverables

The assignment asks for a README containing six things. Each repository's README has all six as headings.

| Required content                | Backend README                                                                                                               | Mobile README                                                                                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup instructions              | [Setup](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/README.md#setup)                                          | [Setup](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/README.md#setup) and [Configuration](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/README.md#configuration-and-access) |
| Build and run instructions      | [Build and run](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/README.md#build-and-run)                          | [Build and run](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/README.md#build-and-run)                                                                                                   |
| Architectural decisions         | [Architectural decisions](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/README.md#architectural-decisions)      | [Architectural decisions](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/README.md#architectural-decisions)                                                                               |
| Assumptions made                | [Assumptions made](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/README.md#assumptions-made)                    | [Assumptions made](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/README.md#assumptions-made)                                                                                             |
| Trade-offs considered           | [Trade-offs considered](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/README.md#trade-offs-considered)          | [Trade-offs considered](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/README.md#trade-offs-considered)                                                                                   |
| How AI-assisted tools were used | [AI usage](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/README.md#how-ai-assisted-development-tools-were-used) | [AI usage](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/README.md#how-ai-assisted-development-tools-were-used)                                                                          |

Also stated openly in each README: **Known limitations**
([backend](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/README.md#known-limitations) ·
[mobile](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/README.md#known-limitations)).

The AI workflow itself is recorded in the repositories: [`CLAUDE.md`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/CLAUDE.md)
(standing instructions, in both repos), the spec-driven `specs/` folders, and ADR-X5 and ADR-X6 above.

**Source code in Git:** both repositories are linked at the top of this page. `main` holds the tagged `v1.0.0` release;
`develop` is the integration branch (Gitflow, ADR-X2).

---

## 4. Functional requirements — Part 1: Backend

All paths are in [`pulsecrypto-backend`](https://github.com/PathmikaW/pulsecrypto-backend). Layers follow ADR-B7:
`domain/` (models, ports, services) → `application/` → `infrastructure/` and `api/`.

| Requirement                                              | What was built                                                                                                                                                                     | Where in the code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Live market streams** — BTC, ETH, SOL, DOGE, XRP    | The five required pairs are always tracked. Extra pairs are chosen at startup by live 24h volume, with a fallback to the required five if Binance fails.                           | [`src/config/pairs.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/config/pairs.ts) · [`src/application/ResolveSupportedPairs.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/application/ResolveSupportedPairs.ts) · [`src/infrastructure/binance/BinancePairResolver.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/infrastructure/binance/BinancePairResolver.ts) · spec [`pair-resolution-strategy.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/specs/pair-resolution-strategy.md) · ADR-B3 |
| **2a. Connect to Binance and ingest order-book updates** | One WebSocket connection to Binance's combined depth and ticker streams, with reconnect and backoff, and a parser that validates each raw message.                                 | [`src/infrastructure/binance/BinanceWsAdapter.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/infrastructure/binance/BinanceWsAdapter.ts) · [`BinanceMessageParser.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/infrastructure/binance/BinanceMessageParser.ts) · port [`MarketDataSource.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/domain/ports/MarketDataSource.ts)                                                                                                                                      |
| **2b. Buffer / batch updates**                           | Conflation: only the latest state per pair is kept between ticks, so the emit rate is independent of the input rate.                                                               | [`src/domain/services/ConflationEngine.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/domain/services/ConflationEngine.ts) · [`src/application/ProcessMarketTick.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/application/ProcessMarketTick.ts) · spec [`buffering-strategy.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/specs/buffering-strategy.md) · ADR-B4 · explained in the README ([What it does](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/README.md#what-it-does))                     |
| **2c. Emit at a configurable interval (default 100 ms)** | A timer broadcasts the conflated state every `BROADCAST_INTERVAL_MS` (default 100).                                                                                                | [`src/config/env.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/config/env.ts) · [`src/server.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/server.ts) (composition root)                                                                                                                                                                                                                                                                                                                                                            |
| **2d. Slow consumers cannot cause unbounded memory**     | No per-client queues. A client whose socket buffer is over the limit is skipped for that tick and evicted after repeated skips. Connection caps as well.                           | [`src/infrastructure/websocket/WsBroadcaster.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/infrastructure/websocket/WsBroadcaster.ts) · [`ClientRegistry.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/infrastructure/websocket/ClientRegistry.ts) · tests [`WsBroadcaster.test.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/tests/unit/WsBroadcaster.test.ts), [`ClientRegistry.test.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/tests/unit/ClientRegistry.test.ts)                         |
| **3. WebSocket server** — each update names its pair     | Local WebSocket server that broadcasts one message per pair per tick. The payload (pair, timestamp, price, spread, pressures, bids, asks, 24h change) is documented and validated. | [`src/infrastructure/websocket/WsServer.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/infrastructure/websocket/WsServer.ts) · payload schema [`contracts/schemas.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/contracts/schemas.ts) · documented in the README ([API and payload format](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/README.md#api-and-payload-format)) · spec [`api-contract.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/specs/api-contract.md)                                    |
| **Buy / sell pressure and spread** (in the payload)      | Deterministic calculation from the order book.                                                                                                                                     | [`src/domain/services/PressureCalculator.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/domain/services/PressureCalculator.ts) · spec [`pressure-spread-formula.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/specs/pressure-spread-formula.md) · ADR-B5                                                                                                                                                                                                                                                                                 |
| **4. REST `GET /pairs/meta`**                            | Display name, trading status, 24h high, low and volume for every supported pair. Real Binance data, 60 s cache, timeout, mock fallback.                                            | [`src/api/routes/pairs.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/api/routes/pairs.ts) · [`src/application/GetPairsMeta.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/application/GetPairsMeta.ts) · [`BinanceRestAdapter.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/infrastructure/binance/BinanceRestAdapter.ts) · ADR-B6 · test [`rest.test.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/tests/integration/rest.test.ts)                                                          |

---

## 5. Functional requirements — Part 2: Mobile

All paths are in [`pulsecrypto-mobile`](https://github.com/PathmikaW/pulsecrypto-mobile). Screens live under
[`src/features/`](https://github.com/PathmikaW/pulsecrypto-mobile/tree/main/src/features); shared building blocks under
[`src/core/`](https://github.com/PathmikaW/pulsecrypto-mobile/tree/main/src/core) (ADR-M8). Screen behaviour is specified in
[`specs/mobile-screens.md`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/specs/mobile-screens.md).

| Requirement                                                                             | What was built                                                                                                                                                              | Where in the code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Market watchlist** — pair, price, 24h change, live indicator, favourite toggle     | The **Markets** tab lists every pair the backend tracks (not a fixed count) in a FlashList with memoised rows.                                                              | [`WatchlistScreen.tsx`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/features/watchlist/presentation/WatchlistScreen.tsx) · [`PairRow.tsx`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/features/watchlist/presentation/PairRow.tsx) · [`ChangeBadge.tsx`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/components/ChangeBadge.tsx) · [`ConnectionIndicator.tsx`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/components/ConnectionIndicator.tsx) · ADR-M3                                                          |
| **2. Search / filter**                                                                  | Search field filters the list as you type.                                                                                                                                  | [`SearchBar.tsx`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/features/watchlist/presentation/SearchBar.tsx) · [`useWatchlist.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/features/watchlist/presentation/useWatchlist.ts) · test [`useWatchlist.test.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/tests/unit/useWatchlist.test.ts)                                                                                                                                                                                                      |
| **3. Favourites** — persist locally, restore on restart                                 | Favourites are stored in MMKV and read synchronously on launch, so there is no flash of empty state.                                                                        | [`src/features/favourites/`](https://github.com/PathmikaW/pulsecrypto-mobile/tree/main/src/features/favourites) (`data/FavouritesRepository.ts`, `domain/IFavouritesRepository.ts`, `presentation/useFavourites.ts`) · [`src/core/storage/mmkv.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/storage/mmkv.ts) · ADR-M5 · test [`FavouritesRepository.test.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/tests/unit/FavouritesRepository.test.ts)                                                                                                         |
| **4. Market details** — price, buy/sell pressure, spread, order book, last-updated time | The **Terminal** screen shows all of them, plus a market-depth chart. The timestamp comes from the backend, never recomputed on the device.                                 | [`MarketDetailScreen.tsx`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/features/market-details/presentation/MarketDetailScreen.tsx) · [`OrderBookView.tsx`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/features/market-details/presentation/OrderBookView.tsx) · [`MarketDepthChart.tsx`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/features/market-details/presentation/MarketDepthChart.tsx) · [`LastUpdatedLabel.tsx`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/components/LastUpdatedLabel.tsx)              |
| **5. Live updates** — smooth under bursts; green/red price flash; animated order book   | Price flash and order-book bar transitions run on the UI thread (Reanimated), so updates cause no JS-thread re-render. Row-scoped store selectors.                          | [`PriceText.tsx`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/components/PriceText.tsx) (flash) · [`OrderBookView.tsx`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/features/market-details/presentation/OrderBookView.tsx) (bars) · [`MarketRepository.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/data/repositories/MarketRepository.ts) (store) · ADR-M4, ADR-M11                                                                                                                                                           |
| **6. Offline behaviour** — show status, keep last data, auto-reconnect                  | Connection status is always visible; data stays on screen when the socket drops; reconnect uses exponential backoff with jitter and infers liveness from broadcast silence. | [`WebSocketSource.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/data/sources/WebSocketSource.ts) · [`useWebSocket.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/hooks/useWebSocket.ts) · [`backoff.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/utils/backoff.ts) · [`useAppState.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/hooks/useAppState.ts) · spec [`offline-behavior.md`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/specs/offline-behavior.md) · ADR-M6, ADR-M7 |
| **7. Pull to refresh** — reload `/pairs/meta` without interrupting the WebSocket        | Pull-to-refresh refetches only the REST metadata through TanStack Query; the WebSocket subscription is untouched.                                                           | [`WatchlistScreen.tsx`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/features/watchlist/presentation/WatchlistScreen.tsx) (`onRefresh`) · [`usePairsMeta.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/hooks/usePairsMeta.ts) · [`RestSource.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/data/sources/RestSource.ts) · ADR-M2                                                                                                                                                                                                |

---

## 6. Non-functional requirements

| Requirement                                | How it is demonstrated                                                                                                                                                                      | Where                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clean architecture**                     | Backend: hexagonal layers with ports, and `server.ts` as the only composition root. Mobile: feature-first with a small `core/`, and barrel exports between features.                        | Backend [`src/domain/ports/`](https://github.com/PathmikaW/pulsecrypto-backend/tree/main/src/domain/ports) · [`src/server.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/server.ts) · ADR-B7. Mobile [`src/core/domain/repositories/IMarketRepository.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/domain/repositories/IMarketRepository.ts) · ADR-M8                                              |
| **Maintainable code**                      | Strict TypeScript, ESLint boundary rules, Conventional Commits, a three-stage Husky gate, and a written spec behind every unit.                                                             | [backend `eslint.config.mjs`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/eslint.config.mjs) · [mobile `eslint.config.js`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/eslint.config.js) · [`commitlint.config.cjs`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/commitlint.config.cjs) · specs folders · ADR-X2                                                                                        |
| **Responsive UI under continuous updates** | FlashList with memoised rows and per-pair selectors, UI-thread animations, cached `Intl` formatters, and live JS-FPS gauge that measured the effect.                                        | [`PairRow.tsx`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/features/watchlist/presentation/PairRow.tsx) · [`intlFormatterCache.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/utils/intlFormatterCache.ts) · [`useJsFps.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/features/telemetry-settings/presentation/useJsFps.ts) · ADR-M3, M4, M11                                     |
| **Efficient state management**             | Zustand for the WebSocket stream (keyed by symbol), TanStack Query for REST. Server state and client state stay separate.                                                                   | [`MarketRepository.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/data/repositories/MarketRepository.ts) · [`queryClient.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/api/queryClient.ts) · [`uiStore.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/store/uiStore.ts) · ADR-M2                                                                                            |
| **Robust connection handling**             | Mobile: backoff with jitter, silence timeout, pause on background. Backend: Binance reconnect, per-IP and total connection caps, backpressure eviction.                                     | [`WebSocketSource.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/data/sources/WebSocketSource.ts) · [`BinanceWsAdapter.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/infrastructure/binance/BinanceWsAdapter.ts) · [`ClientRegistry.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/infrastructure/websocket/ClientRegistry.ts) · ADR-M6, ADR-B3, ADR-B4                        |
| **Appropriate error handling**             | One `AppError` model with localised messages, retry only for transient failures, Zod validation of incoming data (bad messages are dropped, never applied), and a top-level error boundary. | [`errors.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/api/errors.ts) · [`retry.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/api/retry.ts) · [`apiClient.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/api/apiClient.ts) · [`ErrorBoundary.tsx`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/core/components/ErrorBoundary.tsx) · ADR-M6, ADR-M12 |
| **Good separation of concerns**            | Domain models and ports have no framework or I/O imports. Presentation depends on interfaces, not on data sources. Shared wire contract mirrored byte for byte.                             | [backend `contracts/schemas.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/contracts/schemas.ts) · [mobile `src/contracts/schemas.ts`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/src/contracts/schemas.ts) · ADR-X1                                                                                                                                                                                               |
| **Tests**                                  | Backend: 54 tests in 13 files (unit and integration against a real Fastify app and `ws` client). Mobile: 71 tests in 14 suites.                                                             | [backend `tests/`](https://github.com/PathmikaW/pulsecrypto-backend/tree/main/tests) · [mobile `tests/unit/`](https://github.com/PathmikaW/pulsecrypto-mobile/tree/main/tests/unit) · [`06-workflow-and-testing.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/docs/adr/06-workflow-and-testing.md)                                                                                                                               |

---

## 7. Technology requirements

| Requirement                                       | What was used                                                                                                                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend: Node.js, TypeScript, Fastify, WebSockets | Node.js 24 LTS target, TypeScript, Fastify and `ws` — ADR-B1, ADR-B2 · [`package.json`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/package.json)                       |
| Mobile: React Native, Expo                        | Expo SDK 57, React Native 0.86, Dev Client — ADR-M1 · [`package.json`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/package.json)                                         |
| Must run on Android Emulator (required)           | Built and exercised on a Pixel 8, API 35 emulator (`pnpm expo run:android`). Steps: [Build and run](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/README.md#build-and-run) |
| iOS Simulator (optional)                          | Not targeted.                                                                                                                                                                          |
| Versions, environment variables                   | [`04-tech-stack.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/docs/adr/04-tech-stack.md)                                                                             |

---

## 8. Beyond the brief

Extras that were built, each documented and labelled as optional:

| Extra                                                                                                                                                | Where                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Telemetry & Settings screen** (from the Figma mockup) with live JS FPS and WebSocket message rate; other controls are display-only and labelled so | [`src/features/telemetry-settings/`](https://github.com/PathmikaW/pulsecrypto-mobile/tree/main/src/features/telemetry-settings) · ADR-M10                                                                                                       |
| **Docker image** for the backend                                                                                                                     | [`Dockerfile`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/Dockerfile) · [`docker-compose.yml`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/docker-compose.yml) · ADR-X4                                          |
| **AWS EC2 hosting** with HTTPS (Caddy, DuckDNS)                                                                                                      | [`docs/deployment-aws-ec2.md`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/docs/deployment-aws-ec2.md) · [`deploy/aws-ec2-user-data.sh`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/deploy/aws-ec2-user-data.sh) |
| **Shareable release APK** (EAS `preview`, arm64 only)                                                                                                | [`eas.json`](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/eas.json) · [mobile README](https://github.com/PathmikaW/pulsecrypto-mobile/blob/main/README.md#build-and-run)                                                           |
| **Observability**: `/health` and Prometheus `/metrics`                                                                                               | [`src/api/routes/health.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/api/routes/health.ts) · [`metrics.ts`](https://github.com/PathmikaW/pulsecrypto-backend/blob/main/src/api/routes/metrics.ts) · ADR-B8               |
| **Internationalisation** (all strings translated)                                                                                                    | [`src/core/i18n/`](https://github.com/PathmikaW/pulsecrypto-mobile/tree/main/src/core/i18n) · ADR-M9                                                                                                                                            |

---

_This file is kept identical in both repositories. The links point at the `main` branch (the released `v1.0.0` code)._
