## 12. Implementation Notes — Precision Details

Six points worth a final, explicit check during implementation — each is already covered by an ADR above, and each is small enough to be easy to get subtly wrong without a direct check like this one.

**1. Pressure and spread must match the documented formula exactly.**
The formulas are specified in full in ADR-B5 and should be transcribed into `specs/pressure-spread-formula.md` and `PressureCalculator.ts` without deviation: `Spread = lowest_ask − highest_bid`; `Buy Pressure % = (bid_volume_top_N / (bid_volume_top_N + ask_volume_top_N)) × 100`; `Sell Pressure % = 100 − Buy Pressure %`, with `N` sourced from the named `ORDER_BOOK_PRESSURE_DEPTH` constant, not a literal number. Keeping the calculation deterministic and the formula documented is what makes it possible to unit test with an exact expected result.

**2. `lastUpdatedAt` must reflect processing time, not upstream message time.**
Per ADR-B4, the backend stamps each conflated snapshot with the conflation tick's own timestamp — not the raw timestamp on the incoming Binance message. On the mobile side, `marketStore.updatePair` should set this field directly from the incoming payload, with no client-side recomputation, so `LastUpdatedLabel` always renders a value with a single source of truth.

**3. Untracked favourites must render, not disappear — and must not require reaching into another feature's internals.**
Per ADR-M8, `WatchlistScreen` renders every favourited pair regardless of `getTrackedPairs()` membership, obtaining the favourites list exclusively through `features/favourites`'s exported `useFavourites()` hook. A favourited pair outside the current tracked set shows `core/components/UntrackedFavouriteBadge` with a localized label, rather than being silently hidden from the list or causing a rendering error.

**4. The contracts drift check should stay deliberately simple, and needs no authentication anywhere in its path.**
Per ADR-X1, the check fetches `contracts/schemas.ts` from the backend repository's raw GitHub URL and diffs it against the local mirrored copy at `src/contracts/schemas.ts`, failing on any difference. Today it runs as `pnpm run check:contracts` (there is no CI yet — ADR-X3); the two files must be byte-identical, header comments included. No package registry, no personal access token, no publish step — this is what makes the check something a reviewer's own `pnpm install` will never trip over.

**5. There is no server-side or client-side heartbeat/ping-pong message anywhere in this system, by design.**
Per ADR-M6, connection liveness on the mobile side is inferred from the backend's own broadcast cadence: if no message has arrived within `STALE_CONNECTION_TIMEOUT_MS` (a documented multiple of `BROADCAST_INTERVAL_MS`), the connection is treated as dead. If an implementation session (AI-assisted or otherwise) adds a separate ping/pong exchange, that's scope creep relative to this spec, not a missing feature — the broadcast stream already carries the liveness signal.

**6. Scaffold on Expo SDK 57, not SDK 56, and not on whatever the newest beta happens to be at implementation time without re-checking.**
Per §5, SDK 56 has a known Hermes memory regression affecting `react-native-reanimated` specifically — the exact library this app depends on for its core animation requirement (ADR-M4). SDK 58 was in beta, not stable, as of this document's date; if it has stabilized by the time implementation begins, re-verify this regression's status and the SDK 58 migration notes before assuming it's a safe default rather than assuming SDK 57 is still current.

---
