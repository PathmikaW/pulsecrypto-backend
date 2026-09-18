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

