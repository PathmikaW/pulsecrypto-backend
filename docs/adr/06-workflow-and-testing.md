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

**Code quality gates.** ESLint (flat config; 10.x in the backend, 9.x in the mobile repo — §5) + Prettier, TypeScript strict mode, the full pre-commit/commit-msg/pre-push Husky pipeline (ADR-X2), Conventional Commits enforced, and — as designed — no PR merges without CI passing, including the contracts-drift check. **CI does not exist yet (ADR-X3), so today the local Husky hooks are the only gate.**

---

## 8. Testing Strategy

| Layer               | Tool                         | What's covered                                                                                                                                                                                                                                                                                     |
| ------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend unit        | Vitest                       | `ConflationEngine`, `PressureCalculator` (the exact formulas from ADR-B5), message parsing, eviction logic, `BinancePairResolver` (required pairs always present; leveraged/stablecoin symbols excluded; fallback triggers correctly on timeout or error) — all with ports mocked                  |
| Backend integration | Vitest +`ws` client          | REST contract, WebSocket broadcast, mock Binance adapter, startup behavior against a deliberately failing exchangeInfo endpoint (verifies graceful fallback)                                                                                                                                       |
| Mobile unit         | Jest                         | Zustand stores (including dynamic pair membership), mappers, utilities (including locale-aware`formatPrice`/`formatPercent`), `core/` and `favourites/` repository implementations against mocked sources, the `useWebSocket` broadcast-silence timeout logic                                      |
| Mobile component    | React Native Testing Library | `PairRow`, price-flash behavior, `ConnectionIndicator`, `LastUpdatedLabel`, `UntrackedFavouriteBadge`, the `watchlist`/`favourites` merge logic, and that key screens render correctly with the i18n provider mocked to a non-English locale (catches hardcoded strings that bypassed translation) |

**Status (v9.1) — what the suites actually contain.**

- **Backend — Vitest, 13 files, 51 tests, all passing.** Unit tests (11 files) cover `ConflationEngine`, `PressureCalculator`, `PairEligibility`, `BinanceMessageParser`, `BinancePairResolver` (required pairs always present; exclusions; fallback on error/timeout), `BinanceRestAdapter` (including the request timeout), `BinanceWsAdapter`, `ClientRegistry`, `WsBroadcaster` (skip and eviction), `ProcessMarketTick` and `GetPairsMeta` (cache, scoped fallback). Integration tests (2 files) start a real Fastify app and a real `ws` client and check REST bodies and broadcast payloads against `contracts/schemas.ts`, plus the origin allowlist and registry cleanup. As designed, the Binance adapters are unit-tested with an injected fetch/WebSocket; there is no mock Binance server and no test that boots the full `server.ts` against a failing `exchangeInfo` (that fallback is covered at the resolver's unit level and by a manual run).
- **Mobile — Jest, 14 suites, 71 tests, all passing.** Unit tests cover the REST error/retry layer of ADR-M12 (`backoff`, `errors`, `apiClient` via an injected adapter, and the retry policy through a real `QueryClient`), `WebSocketSource` (backoff, silence timeout), `MarketRepository`, `createThrottledStorage`, `FavouritesRepository`, `useWatchlist` (tracked/untracked merge, search, fallback to cached data, favourite toggle), the mapper and the formatting utilities.
- **Not covered:** the mobile "component" row above. `@testing-library/react-native` is installed but there are no component tests — no `PairRow`, `ConnectionIndicator`, `LastUpdatedLabel` or `UntrackedFavouriteBadge` tests and no non-English-locale render check. Component behaviour was verified by running the app on the Android Emulator (screenshots of Terminal, Markets, Telemetry, an offline/reconnect cycle) rather than by automated tests.

---
