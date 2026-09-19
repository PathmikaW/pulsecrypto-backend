## 9. README Content Plan

**Setup instructions.** Prerequisites (Node.js, Android Studio, Xcode), backend setup (environment variables, Docker), mobile setup (`pnpm expo prebuild`), a note that all screens follow the Figma reference linked at the top of this document.

**Build and run instructions.** Backend via `pnpm dev` or `docker-compose up`; mobile via `pnpm expo prebuild && pnpm expo run:android` (or `pnpm expo start --dev-client` for JS-only iteration against an existing development build).

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

**Status as of v9.1.** `[x]` means verified against the running system or the code in this session (evidence in the note); `[ ]` means not done, not verifiable here, or needing the developer's own sign-off. Nothing is ticked on the strength of the design alone.

- [x] Backend connects to Binance via the combined stream (depth + ticker), built from the resolved pair list — _live run: 8 pairs streaming, 492 Binance messages received in the first seconds_
- [x] The five required pairs are always included, regardless of pair-resolution outcome — _unit-tested; also seen live_
- [x] Additional pairs are resolved dynamically by live 24h quote volume, excluding leveraged/synthetic tokens and stablecoin-to-stablecoin pairs — _live run resolved NEAR, UNI and ZEC on top of the required five_
- [x] Pair resolution falls back gracefully to the required five if Binance is unreachable or times out at startup — _unit-tested (error and timeout paths); resolution runs once — no background retry (ADR-B3)_
- [x] Updates are buffered/batched at a configurable interval (100ms default) — _BROADCAST_INTERVAL_MS, default 100_
- [x] Slow-consumer memory growth is prevented via a single, documented backpressure mechanism — _WsBroadcaster unit tests: skip, eviction with close code 1013_
- [x] Buy Pressure, Sell Pressure, and Spread are computed using the documented formulas (ADR-B5), with `ORDER_BOOK_PRESSURE_DEPTH` as a named, configurable constant, and covered by unit tests against fixture data — _PressureCalculator unit tests against fixtures; N = ORDER_BOOK_PRESSURE_DEPTH_
- [x] The WebSocket server broadcasts to connected mobile clients — _integration test plus a live client and the emulator_
- [x] `GET /pairs/meta` returns real data with a documented, correctly-scoped mock fallback — _integration test for the contract and the fallback; live call returned 200_
- [ ] The mobile repo's mirrored `src/contracts/` matches the backend repo's `contracts/` source of truth; the CI diff check passes — _mirror is byte-identical and `pnpm run check:contracts` passes on demand, but there is no CI (ADR-X1, ADR-X3), so the box stays open_
- [x] The mobile watchlist renders every currently-tracked pair, with no hardcoded count assumption — _emulator: all 8 pairs rendered; `useWatchlist` test_
- [x] Each row shows trading pair, current price, 24h change, connection indicator, favourite toggle — _emulator screenshot of Markets_
- [x] Search/filter works — _`useWatchlist` test (case-insensitive, symbol or display name); search field visible on the emulator_
- [x] Favourites persist locally, and a favourited-but-currently-untracked pair is handled gracefully via `UntrackedFavouriteBadge`, obtained through `favourites`'s public hook rather than reaching into its internals — never hidden or crashing — _`FavouritesRepository` and `useWatchlist` tests (untracked favourite handling); not toggled by hand on the emulator_
- [x] Market Details shows price, buy/sell pressure, spread, order book, and **last updated timestamp** — _emulator: Terminal screenshots, timestamp at the bottom of the scrolled screen_
- [x] `lastUpdatedAt` reflects the backend's conflation-tick time, is passed through unmodified to `marketStore`, and renders via `LastUpdatedLabel` in a locale-aware format — _integration test asserts lastUpdatedAt equals the tick time; label rendered on the emulator_
- [x] The mobile client detects a dead connection via broadcast silence (no separate heartbeat messages sent or expected) — _`WebSocketSource` unit tests; no ping/pong anywhere_
- [x] The UI remains smooth under sustained updates (price flash, order book animation both verified under load) — _JS-thread FPS gauge read 55 on the emulator with 8 pairs streaming; see ADR-M3 for what was and wasn't measured_
- [x] Offline behavior is correct: stale data remains visible, connection status is shown, reconnection is automatic — _emulator: backend stopped -> "RECONNECTING…" with last prices kept; restarted -> "LIVE" automatically_
- [x] Pull-to-refresh works without interrupting the live WebSocket stream — _by code: RefreshControl calls only the TanStack Query refetch; not exercised by hand on the emulator_
- [ ] Every user-facing string is routed through `react-i18next` — no hardcoded English text bypassing the translation layer; verified by rendering key screens under a non-English locale in mobile component tests — _all screens use `t()` (inspection), but no component tests exist, so this stays open (§8)_
- [x] Price and percentage formatting uses `Intl.NumberFormat` respecting the active locale, not a hardcoded formatting convention — _`formatPrice`/`formatPercent` tests, cached formatter instances_
- [x] The full Husky pipeline (pre-commit, commit-msg, pre-push) is installed and functioning identically in both repositories — _identical in both repos as of v9.1 (mobile pre-push previously skipped the tests)_
- [x] Dependency direction matches the stated architecture in both repositories — spot-check that nothing in the backend's `domain/` imports from `infrastructure/` or `data/`, and that no mobile feature reaches into another feature's internals rather than its barrel export — _grep-checked in v9.1; two backend violations found and fixed; one disclosed narrow exception in mobile (ADR-M8)_
- [x] Unit and integration tests are present and passing, including pair-resolver and pressure-calculator coverage — _backend 51/51 (13 files), mobile 71/71 (14 suites)_
- [ ] Implemented screens match the Figma mockup referenced at the top of this document — including the "Terminal" and "Telemetry & Settings" screens and account drawer, built at full fidelity per ADR-M10, and the freshly-designed "Markets" screen visually consistent with `design-tokens.md` — _needs the developer's own sign-off; emulator screenshots look consistent_
- [ ] Every screen draws colors/type/spacing from `core/theme/` (sourced from `specs/design-tokens.md`), not a hardcoded literal — including the Markets screen, which has no Figma frame to check against — _not audited exhaustively; a few literal values exist (e.g. shadow colors, one `rgba` border)_
- [x] Telemetry & Settings' non-backed controls (throttling slider/toggles) and the account drawer's account-management links are documented in the README as intentionally display-only (ADR-M10) — not left for a reviewer to discover unexplained — _mobile README documents this_
- [x] Telemetry's WS message-rate (and, if implemented, JS-thread FPS) reflect real measured values, not static mockups — _JS FPS read live on the emulator; message rate is counted per second in `WebSocketSource`_
- [x] The README is complete (setup, architecture, ADRs, trade-offs, AI usage, pair-resolution strategy, localization approach) and any claim about a third party's technology choices is stated consistently everywhere it appears in the document — _both READMEs revised in v9.1_
- [ ] Screen recording demonstrates the required functionality, ideally including the dynamically-resolved additional pairs alongside the required five — _only the developer can record this; the emulator flows above can be reused as the script_
- [x] **The mobile app was built and run on the Android Emulator via `npx expo run:android`, and the screen recording is captured from that build** — this is the assignment's explicit, required target platform (§1 "Technology Requirements"); iOS Simulator is optional and does not substitute for it — _built with `pnpm expo run:android` earlier; re-verified in v9.1 on the Pixel 8 API 35 emulator via the dev client. The recording itself is still to be captured_
- [ ] Docker build and run succeed for the backend — _NOT verified — Docker is not installed on the development machine (ADR-X4)_
- [ ] CI passes on both repositories, including the mandatory contracts-drift check — _NOT done — no CI exists (ADR-X3)_
- [x] All package versions were verified against `pnpm info <package> version` at scaffold time, not assumed from this document's snapshot (§5) — _§5 now lists the installed versions_
- [x] Both project scaffolds (`pnpm dlx fastify-cli generate . --lang=ts` for the backend, `pnpm create expo-app` + `pnpm expo prebuild` for mobile) were run manually by the developer and verified running before any feature implementation began (ADR-X5) — not hand-authored by an AI coding session. Backend verified via actual compile (`pnpm run build:ts`, exit 0) and server start (`pnpm start`, confirmed listening via `lsof`); mobile verified via `pnpm expo run:android` on the Android Emulator.
- [x] Both repos use pnpm consistently — `pnpm-lock.yaml` committed, no stray `package-lock.json`/`yarn.lock` from an accidental npm/yarn command (ADR-X5)
- [x] Incoming WebSocket messages are validated against the mirrored contract schema before reaching `marketStore`, and a malformed message is dropped and logged rather than crashing the app (ADR-M6, v8.1) — _`MarketUpdateSchema.safeParse` in `useWebSocket`; malformed messages are dropped_
- [x] The mobile app has a top-level error boundary with a recoverable fallback screen, not a raw crash, on a rendering error (ADR-M6, v8.1) — _`ErrorBoundary` wraps the navigator in `app.tsx`_

---

- [x] REST failures are normalized to one `AppError` model, retried only when retryable (max 3, exponential backoff with jitter, shared with the WebSocket reconnect arithmetic), and surfaced as localized messages — _ADR-M12; unit-tested through a real `QueryClient` and exercised on the Android Emulator against a fake backend (503×3 → recovers; persistent 503 → stops after 4 attempts; 404 → 1 attempt)_
- [ ] `release/v1.0.0` cut from `develop`, merged into `main` with a `v1.0.0` tag, and merged back into `develop` — _not done: `main` is still the empty initial commit; `develop` is the default branch, so reviewers see the code (ADR-X2)_
- [ ] Run the manual gates before submitting: `pnpm audit --prod` (backend clean; mobile 1 moderate transitive `uuid` advisory via Expo config plugins), `pnpm run check:contracts` (mobile)

---
