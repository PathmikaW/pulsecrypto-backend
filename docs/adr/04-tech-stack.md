## 5. Technology Stack Summary

**Every version below was checked against a current source as of this document's date, not assumed from prior knowledge** — several of these ecosystems move fast enough that a stale guess would have undercut the point of specifying versions at all. Exact patch releases still shift between now and actual implementation; run `pnpm info <package> version` immediately before scaffolding to confirm the latest patch within the stated major/minor line.

**Package manager: pnpm for both repos** (ADR-X5 — options considered, verified directly against both Fastify's and Expo's own getting-started docs). Lockfile is `pnpm-lock.yaml`, committed in both repos. Any `npm install`/`npm i` elsewhere in this document should be read as `pnpm add` unless it's quoting an external tool's own doc text verbatim.

**Install rule for anything with native code:** for `react-native-reanimated`, `react-native-mmkv`, `expo-localization`, and any future native module, install via `pnpm expo install <package>` rather than plain `pnpm add`. Expo resolves the specific version known-compatible with the installed SDK automatically — this matters more than for a typical package, because an incompatible native-module version can fail at build time in a way plain semver ranges won't catch. (`pnpm expo ...` — not `npx expo ...` — is correct here: verified directly against pnpm's own docs that `pnpm <binary>` is a shorthand for `pnpm exec <binary>` for any locally installed package binary that doesn't collide with a pnpm builtin command, and `expo` is a local dependency once the project is scaffolded. This stays entirely inside the pnpm toolchain rather than reaching for npm's `npx`. Same applies to `pnpm expo prebuild` / `pnpm expo run:android` — confirmed working directly, not just theoretically equivalent.)

### Backend

| Concern          | Choice                                                                                                                 | Current version (verified)                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime          | Node.js                                                                                                                | **24.x (Active LTS)** — Node 24 is the current Active LTS line; Node 22 is now in maintenance-only mode                                             |
| Package manager  | pnpm                                                                                                                    | Enabled via Node's built-in Corepack (`corepack enable`) — see ADR-X5                                                                                |
| Language         | TypeScript                                                                                                             | **6.0.x** (was 5.9.x as of this document's original check; superseded — confirmed 6.0.2 via `pnpm dlx fastify-cli generate . --lang=ts`, independently corroborated by mobile's Expo scaffold resolving 6.0.3 the day before)                                                                                                                                            |
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

> **Callout — TypeScript 6.0 requires `rootDir` explicitly, where 5.x didn't.** The
> official Fastify TS scaffold's `tsconfig.json` extends `fastify-tsconfig`, which doesn't
> set `rootDir` — TypeScript 5.x inferred it fine, but 6.0 raises `error TS5011` ("The
> common source directory... The 'rootDir' setting must be explicitly set") as soon as
> `outDir` is also set, which the scaffold does. Fix: add `"rootDir": "src"` to
> `compilerOptions` alongside `"outDir": "dist"`. This is a `fastify-tsconfig` compatibility
> gap with TS 6.0 that hadn't been patched upstream as of this scaffold — re-check whether
> it's still needed if `fastify-tsconfig` has caught up by the time this is read again.
> Verified by actually compiling (`pnpm run build:ts`, exit 0, real output in `dist/`) and
> starting the server (`pnpm start`, confirmed listening on `localhost:3000` via `lsof`),
> not just by the absence of an error message.

### Mobile

| Concern            | Choice                                                                                          | Current version (verified)                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | Expo (Dev Client / Prebuild)                                                                    | **SDK 57** (React Native 0.86, React 19.2) — see the callout below; SDK 58 is in beta as of this writing and not yet the stable recommendation |
| Package manager    | pnpm                                                                                            | `pnpm create expo-app` — documented directly by Expo as a first-class option (ADR-X5)                                                                |
| Language           | TypeScript                                                                                      | 6.0.x (same as backend — confirmed 6.0.3 from the actual `pnpm create expo-app` scaffold)                                                                                                                               |
| Navigation         | React Navigation (Native Stack)                                                                 | 7.x                                                                                                                                                   |
| State — real-time | Zustand                                                                                         | 5.x                                                                                                                                                   |
| State — REST      | TanStack Query                                                                                  | **5.102.x**                                                                                                                                     |
| List rendering     | FlashList                                                                                       | v2.x                                                                                                                                                  |
| Animation          | react-native-reanimated                                                                         | See callout below — install via`npx expo install`, do not pin an independent version                                                               |
| Persistence        | MMKV                                                                                            | `react-native-mmkv` 3.x — install via `npx expo install`                                                                                         |
| WebSocket          | Custom hook, native WebSocket API, broadcast-silence liveness (no separate heartbeat — ADR-M6) | —                                                                                                                                                    |
| HTTP               | fetch (built-in)                                                                                | —                                                                                                                                                    |
| Localization       | `i18next` + `react-i18next`, `expo-localization` — ADR-M9                                | Install`expo-localization` via `npx expo install`; `i18next`/`react-i18next` via plain `pnpm add` (pure JS, no native code)              |
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

