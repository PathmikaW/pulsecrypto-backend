## 4. Cross-Cutting Decisions

### ADR-X1: Repository & Contract Strategy

**Context.** The backend and mobile codebases are organized as separate repositories, and the WebSocket/REST payload contract between them — two independently deployable services — needs to not silently drift out of sync, without adding operational risk disproportionate to what it's protecting against in this specific context: a solo developer building both repositories, most likely in the same sitting or the same AI-assisted session.

**Options considered:**

| Option                                                                                                                                                                     | Pros                                                                                                                                                                     | Cons                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo                                                                                                                                                                   | Shared types, single CI pipeline                                                                                                                                         | Setup complexity disproportionate to this project's scope, and doesn't match the assignment's own framing of two separate deliverables                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Two repos, contract duplicated, no automated check                                                                                                                         | Simplest possible setup                                                                                                                                                  | Pure manual discipline — a real drift risk, not just a theoretical one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Two repos + a published shared package (`@pulsecrypto/contracts`, via GitHub Packages)                                                                                     | Contract-first; drift caught by CI rather than by hoping someone remembers                                                                                               | **Rejected on review.** GitHub's own documentation states plainly that an access token is required to install a package via GitHub Packages — public or private, no exception. A reviewer cloning the mobile repository and running `npm install` would fail unless they had their own personal access token configured, which risks breaking the single most basic requirement of a submission: that it installs and runs. This is a worse failure mode than the drift risk it was meant to solve, and a third repository/package to publish and version is disproportionate overhead for one developer building both consuming sides. |
| **Two repos; `contracts/` owned by the backend, mirrored into the mobile repo, drift caught by a CI step that diffs the mobile copy against the backend's raw GitHub URL** | Gets the meaningful protection — drift becomes a build failure, not a hope — with zero registry, zero publish step, and zero authentication anywhere in the install path | The mobile copy is a mirror, not a live import — a deliberate, disclosed trade, not an oversight                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

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

**Status (v9.1): the CI step above is designed but not implemented — neither repository has a CI workflow.** What exists instead: the mobile mirror is byte-identical to the backend file (`cmp` exit 0), and `pnpm run check:contracts` in the mobile repo runs the same raw-URL diff on demand. It targets the backend's `develop` branch, because `main` is still the empty initial commit (see ADR-X2's status note) and its raw URL returns 404. Until CI exists, run it before every mobile push and after any change to `contracts/schemas.ts`. (Through v9.0 the two files differed in header comments, so the diff described here would have failed; they were made identical in v9.1.)

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

**Decision.** Gitflow — a persistent `develop` integration branch, short-lived `feature/*` (new functionality) and `fix/*` (bug fixes) branches off it, `release/*` branches for stabilizing a set of features, and `hotfix/*` branches for urgent post-release fixes, with `main` reserved exclusively for tagged, released code — alongside Conventional Commits and the same three-stage Husky hook pipeline, applied identically in both repositories.

**Branching:**

```
main (production-only, protected, tagged releases — receives merges only from release/* or hotfix/*)
 └── develop (integration branch, always green, protected — receives merges only from feature/*, fix/* or release/*)
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

- `feature/*` and `fix/*` branches off `develop`, PR'd and merged back into `develop` (the actual history shows GitHub merge commits, `Merge pull request #N`, not squashes).
- `release/*` branches off `develop` once a coherent set of features is ready to stabilize;
  only bug fixes are permitted on a release branch, never new feature work; on completion
  it merges into both `main` (tagged, e.g. `v1.0.0`) and back into `develop`, so any
  release-branch fixes aren't lost on the next cycle.
- `hotfix/*` branches off `main` directly, for an urgent fix to what's already released;
  merges into both `main` (tagged, e.g. `v1.0.1`) and `develop`, for the same reason.
- `main` never receives a feature merge directly — every change reaches it only via a
  `release/*` or `hotfix/*` branch, so its history reads as a sequence of releases, not
  day-to-day development noise.

**Status (v9.5).** Gitflow was completed end to end in both repositories. All work flowed `feature/*` / `fix/*` → `develop` through pull requests, and `develop` is the GitHub default branch, so a reviewer who clones either repo sees the real code. `release/v1.0.0` was cut from `develop` in both repositories and kept identical to it (release fixes — the backend Dockerfile, then the mobile release-build dependencies and three UI alignment fixes — went `fix/*` → `develop`, and the release branch was fast-forwarded to match). `release/v1.0.0` was then merged into `main` with a merge commit (not a squash, so `develop` stays a descendant of `main`), `v1.0.0` was tagged on `main`, and `main` was merged back into `develop`. `fix/*` is used for bug-fix branches alongside `feature/*`; both are cut from `develop` and merged by pull request. The three-stage Husky pipeline is identical in both repositories — before v9.1 the mobile `pre-push` hook ran only `tsc --noEmit` (a stale TODO said to add the tests once they existed).

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

| Hook                | Runs                             | Purpose                                                                                                                                                                                                                                                                        |
| ------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.husky/pre-commit` | `lint-staged`                    | ESLint`--fix` and Prettier `--write`, scoped only to staged files — fast enough to run on every commit without friction                                                                                                                                                        |
| `.husky/commit-msg` | `commitlint`                     | Validates the commit message against Conventional Commits format; a malformed message is rejected before it enters history                                                                                                                                                     |
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

**Status (v9.1): not implemented — no `.github/workflows/` exists in either repository.** The local Husky pipeline (ADR-X2) is the only automated gate today, and it can be bypassed with `--no-verify`. The pipelines below are the intended design. Their local equivalents, all currently green: backend `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm run build:ts`; mobile `pnpm lint && pnpm run typecheck && pnpm test && pnpm run check:contracts` plus `pnpm expo export --platform android` as the bundling check. `pnpm audit --prod` reports no vulnerabilities for the backend and one moderate transitive advisory for mobile (`uuid`, reached only through Expo's build-time config plugins, so not part of the runtime bundle). `expo-doctor`, the Android native build check and the Docker build have not been run in CI form.

**Backend CI:**

```yaml
on: [push, pull_request]
jobs:
  ci:
    steps:
      - Checkout
      - Setup pnpm (pnpm/action-setup) + Setup Node (current LTS — see §5), cache: pnpm
      - Install dependencies (pnpm install --frozen-lockfile)
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
      - Setup pnpm (pnpm/action-setup) + Setup Node (current LTS — see §5), cache: pnpm
      - Install dependencies (pnpm install --frozen-lockfile)
      - Verify src/contracts/schemas.ts matches the backend's source of truth
        (raw-URL diff check — ADR-X1; no auth, no registry)
      - Lint (ESLint)
      - Type check (tsc --noEmit)
      - Test (Jest)
      - Expo Doctor (configuration verification)
      - expo prebuild + expo run:android build check (no EAS dependency)
```

**Rationale.** Automated checks catch issues before merge and demonstrate CI/CD discipline; each step maps to a specific risk this document has already named (contract drift, type errors, regressions, a broken native build). The backend has no contracts-check step of its own, since it is the source of truth the mobile repository checks itself against, not the other way around.

**Trade-offs accepted.** CI run time — kept short and proportionate to this project's scope.

---

### ADR-X4: Deployment Strategy — Docker for the Backend

**Context.** The backend needs to run identically across a local machine, CI, and a container orchestrator.

**Decision.** A multi-stage Docker build, run via `docker-compose` locally.

```dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build:ts

FROM node:24-alpine
WORKDIR /app
RUN corepack enable && addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
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
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - BROADCAST_INTERVAL_MS=100
      - EXTRA_PAIRS_COUNT=3
      - PAIR_RESOLUTION_TIMEOUT_MS=5000
      - ORDER_BOOK_PRESSURE_DEPTH=10
    restart: unless-stopped
```

_(No top-level `version:` key — deprecated in the current Compose spec; modern Compose ignores/warns on it. Base image uses `node:24-alpine` — see §5 for why Node 24 specifically.)_

**Status (v9.4).** The image is now build- and run-verified: `docker build` and `docker run` succeeded on a Linux VM (Amazon Linux 2023, x86-64, 1 GB RAM plus a 1 GB swap file for the build), and the container served `/health`, `/pairs/meta` and the WebSocket with all eight pairs resolved. The first attempt **failed**: `pnpm install --frozen-lockfile` stopped with `ERR_PNPM_IGNORED_BUILDS` for esbuild, because `pnpm-workspace.yaml` (which holds the `allowBuilds` approval) was not copied into the builder stage before the install. The Dockerfile now copies it alongside `package.json` and the lockfile, as in the listing above. `docker-compose up` itself has not been run — the compose file is unexercised — and no Docker is installed on the development laptop. One known imprecision remains: the runtime stage copies the builder's whole `node_modules`, devDependencies included, so "build tooling never ships" is true of the TypeScript sources but not of dev packages; `pnpm prune --prod` in the builder before the copy is the standard fix, left unapplied. _(Through v9.3 this note said the image had never been built.)_ _(v9.5: the same image also runs on a t3.micro EC2 instance behind Caddy with a free DuckDNS hostname, giving the shareable mobile APK an `https://`/`wss://` backend — `pulsecrypto-backend/docs/deployment-aws-ec2.md`. The instance stops itself after six hours and is started only for demos and testing.)_

**Rationale.**

1. A non-root user and a minimal base image are standard container-security practice.
2. A multi-stage build keeps sources and the compile step out of the runtime image (see the v9.1 status note above on devDependencies).
3. This is also the natural on-ramp to a typical AWS/Kubernetes deployment path, without building infrastructure beyond what this exercise can meaningfully demonstrate. Unlike the contracts-package decision above, adopting Docker here doesn't introduce any install-time risk for a reviewer — `pnpm dev` still works standalone, with or without Docker — so there was no corresponding reason to simplify it away.

**Trade-offs accepted.** One additional file to maintain, in exchange for a portable, reproducible runtime.

---

### ADR-X5: Framework Scaffolding & the Human/AI Division of Labor

**Context.** This project is built with AI-assisted development throughout (§7), which
raises a specific question the assignment itself flags as something it's evaluating —
"how effectively you leverage AI" — namely: which parts of the work should an AI coding
session do directly, and which parts should the developer do themselves and hand off a
verified result? Framework scaffolding (generating the initial Fastify project, generating
the initial Expo project, running `expo prebuild` to produce the native `android/`/`ios/`
directories) is exactly this kind of boundary case — an AI session _could_ hand-write a
`package.json`, a `tsconfig.json`, and an `app.json` that approximate what the official
generator produces, but "approximate" is the operative risk: official scaffolding tools
encode a large number of framework-specific, version-specific, and platform-specific
details (correct peer dependency ranges, correct native project structure, correct default
configuration) that are easy to get subtly wrong by hand, and a subtle scaffold error is a
worse failure mode than a slower start, because it surfaces later as a confusing build
failure rather than an immediate, obvious one.

**Decision.** Every framework/project-structure scaffolding step is run **manually, by the
developer, in their own terminal, using each framework's official setup path** —
never generated or approximated by an AI coding session. This applies specifically to:

- **Backend:** `pnpm dlx fastify-cli generate . --lang=ts` — invokes `fastify-cli`'s
  `generate` command directly, **not** `pnpm create fastify`. This decision went through
  three checks, not one, and all three are worth keeping rather than only the final answer:
  (1) the framework's main Getting Started guide shows no generator at all, which wrongly
  suggested none existed; (2) `create-fastify` (`github.com/fastify/create-fastify`) turned
  out to be a real, Fastify-org-maintained generator, invoked via `pnpm create fastify
--lang=ts` — verified to produce genuine TypeScript output; (3) directly comparing that
  output against `pnpm dlx fastify-cli generate . --lang=ts` found `create-fastify`
  resolves noticeably older pinned dependencies (`fastify-cli` 7.4.1, TypeScript 5.9.2)
  than calling `fastify-cli` directly (`fastify-cli` 8.0.2, TypeScript 6.0.2) — `fastify-cli`
  itself is the more actively current path, and `create-fastify` appears to lag behind it.
  §5's tech stack table reflects the TypeScript 6.0.x this actually resolved to, corroborated
  independently by mobile's own scaffold. Both `fastify-cli` and `create-fastify` are
  legitimate official Fastify tools; this project uses the one verified to be more current.
- **Mobile:** `pnpm create expo-app` (see Package Manager decision below) for initial
  project generation — verified directly against `docs.expo.dev/get-started/create-a-project/`,
  which documents pnpm as a first-class option alongside npm/yarn/bun — and
  `pnpm expo prebuild` for generating the native `android/`/`ios/` directories (ADR-M1;
  `pnpm expo ...`, not `npx expo ...` — see §5's install-rule note on the verified pnpm
  binary-shorthand mechanism).
- Any future equivalent: if a new top-level framework or native module is ever introduced
  that has its own official generator/installer, that generator is run manually too — this
  is a standing rule, not a one-time exception for the two cases above.

**Package manager: pnpm, for both repositories.** Not decided by default — evaluated
explicitly, the same as every other tool choice in this document:

| Option               | Pros                                                                                                                                                                                                                                                                       | Cons                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm                  | Ships with Node, zero setup, universally documented                                                                                                                                                                                                                        | Slower installs, weaker dependency-hygiene guarantees (hoisting permits "phantom dependencies" — importing a package that's transitively present but not actually declared) |
| Yarn Classic (v1)    | Historically fast, widely known                                                                                                                                                                                                                                            | No longer actively developed — not a genuine current choice for a new project                                                                                               |
| Yarn Berry (v2+/PnP) | Fast, workspace-native                                                                                                                                                                                                                                                     | PnP mode has a real history of friction with Metro (React Native's bundler); more configuration surface than the alternatives                                               |
| **pnpm**             | Fastest installs, most disk-efficient (content-addressable store), **enforces strict dependency resolution — a phantom-dependency import fails instead of silently working**, first-class Expo support (`pnpm create expo-app`, verified directly against Expo's own docs) | Slightly less universal tooling familiarity than npm, though this gap has closed substantially                                                                              |

**Decision.** pnpm. The strict-resolution property is the deciding factor, not just
install speed — it's a correctness property consistent with this document's broader
emphasis on enforced (not just named) architectural boundaries (see ADR-B7, ADR-M8): a
dependency that isn't declared in `package.json` simply won't resolve, rather than working
by accident because some other package hoisted it into `node_modules`. Both scaffolding
paths confirmed working with pnpm by actually running them, not just by reading docs:
`pnpm create expo-app` (Expo documents pnpm natively) and `pnpm dlx fastify-cli generate .
--lang=ts` (a direct `pnpm dlx` invocation of an npm-registry package — no
package-manager-specific behavior to verify at all, since `dlx` just runs the package's own
CLI once).

**Practical implications, applied consistently everywhere npm was previously assumed:**

- Lockfile: `pnpm-lock.yaml`, committed in both repos (never gitignored).
- CI: install steps use `pnpm install --frozen-lockfile`, with `pnpm/action-setup` (or
  equivalent) added before the Node setup step (ADR-X3).
- Docker: the backend's multi-stage build (ADR-X4) enables pnpm via Node's built-in
  Corepack (`corepack enable`) rather than a separate global install, and uses
  `pnpm install --frozen-lockfile` in place of `npm ci`.
- Any remaining `npm install`/`npx` reference elsewhere in this document or in either
  repo's `CLAUDE.md` should be read as `pnpm add`/`pnpm dlx` unless it's specifically
  quoting an external tool's own documented npm/yarn-only command (e.g. Fastify's guide
  text, quoted verbatim above for traceability to its source).

**What this does _not_ cover.** Routine dependency installation during feature
implementation — adding `zustand`, `i18next`, a testing library, or any other package a
spec calls for — is normal implementation work, not "creating the framework or project
structure," and an AI coding session may run these (`pnpm add`, or `npx expo install` for
native-code packages per §5's install rule — Expo's own install command stays npx-invoked
regardless of package manager, since it's Expo's CLI doing the version-resolution work, not
a package fetch) as part of building a spec'd feature. The
boundary is specifically the _initial scaffold_ — the moment a project's foundational
structure and configuration come into existence — not every subsequent `pnpm add`
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
   leverage AI" is demonstrated as much by knowing where _not_ to delegate to AI as by using
   it well everywhere else; this is the same judgment already exercised elsewhere in this
   document (see the Executive Summary's "complexity is added deliberately, in both
   directions" principle) applied to the human/AI boundary specifically, rather than only to
   architectural complexity.

**Trade-offs accepted.** A slower start for each repository (the developer runs a command
and waits, rather than an AI session generating equivalent files instantly) — a small,
one-time cost per repository, accepted deliberately in exchange for removing scaffold-
correctness as a category of risk for the rest of the build.

---

### ADR-X6: AI Session Continuity & Verification Discipline

**Context.** AI-assisted coding sessions (Claude Code or equivalent) are not continuously
stateful — a fresh session, or a session resumed after context compaction, has no
guaranteed intact memory of everything a prior session did, decided, or verified. Left
unaddressed, this creates two concrete risks, not hypothetical ones — both materialized
once already during this project's setup, before this ADR existed:

1. **Silent architectural drift.** A session can act on a summarized or half-remembered
   version of a decision instead of the decision's actual, current, authoritative text —
   producing work that quietly diverges from what this document and `specs/` actually say,
   without anyone deciding to diverge.
2. **Declaring a task done without verifying the aggregate result.** A multi-step task can
   have every individual step's output look correct while the _final combined state_ is
   wrong — concretely, an initial Gitflow branch bootstrap (ADR-X2) produced a rootless
   commit with no real `main`/`develop` ancestry, because each `git checkout -b` step
   reported success individually, and the session that ran it had already identified the
   risk mid-task, noted it internally, and proceeded without either resolving it or saying
   so — only caught when the user reviewed the pushed result directly.

**Decision.** Two binding disciplines, stated here and in both repositories' `CLAUDE.md` —
so they load automatically at the start of _every_ session, regardless of which Claude Code
instance, conversation, or point in this project's timeline is running:

1. **Session-start grounding, every time — new session, resumed session, or immediately
   after a context-compaction event.** Before making any change: read that repo's
   `CLAUDE.md` in full, read the specific `specs/*.md` file(s) the task actually touches,
   and check real current repository state with direct commands (`git status`,
   `git log --oneline --all --graph`, `git ls-remote origin`, relevant `ls`/file reads) —
   never proceed on a conversation summary's account of what state things are in, or on a
   prior session's stated outcome, when a direct check is available and cheap. A summary
   can lose fidelity or be wrong; the committed files and actual git state cannot.
2. **Verify the aggregate outcome directly before calling a structural task done — never
   infer it from individual step outputs.** This applies specifically to anything that
   changes structural state: git topology, folder/dependency architecture, contract
   schemas, anything §12's "Implementation Notes" calls out as easy to get subtly wrong. If
   a risk or edge case is noticed mid-task, resolve it before finishing, or say it out loud
   explicitly to the user — **never silently note a risk internally and proceed as if it
   were handled.** Noticing a problem and not acting on it is a worse outcome than not
   noticing it at all, because it creates the appearance of care without the substance of
   it.

**Rationale.**

1. **This document's own authority hierarchy (`specs/` → ADR → `CLAUDE.md`) only holds if
   every session actually re-establishes it from source, every time** — an assumed or
   remembered version of the hierarchy's content is not the same thing as the hierarchy
   itself, and treating them as equivalent is precisely how drift enters a long-running,
   multi-session, AI-assisted project undetected.
2. **This is a general discipline from professional software engineering practice —
   "verify the actual state, don't trust the log of what you intended to do" — applied
   specifically to the failure mode AI coding sessions are most prone to:** a fluent,
   confident narration of success that was never checked against the real, resulting
   system state. The assignment's emphasis on how AI-assisted development is used
   (Executive Summary) makes this a direct quality bar, not an abstract concern.
3. **Stated as an ADR, not only as CLAUDE.md guidance, because it is exactly as real and
   binding a process decision as ADR-X2 (Gitflow) or ADR-X5 (manual scaffolding) — the
   thing it protects (consistency of the architecture and process across many separate AI
   sessions over the life of this project) is the same category of concern those decisions
   address, just aimed at the AI-assisted workflow itself rather than at the code.**

**Trade-offs accepted.** Every session pays a small, fixed cost re-reading `CLAUDE.md` and
the relevant specs, and running a handful of verification commands before and after
structural changes, rather than proceeding directly from assumed context — a deliberate
trade of a small amount of speed for materially lower risk of the exact class of mistake
this ADR exists to prevent.

---

### ADR-X7: ADR Document Structure — Split by Topic, Not One Monolithic File

**Context.** Through v8.3, this entire ADR lived in one file, 1,783 lines. Two problems
surfaced from that, both about AI-session token economy rather than the content itself:
`CLAUDE.md` in each repo (loaded unconditionally on every session) pointed to this single
file as "the full rationale," and a session with no more specific guidance than that would
often read the whole thing to answer one question — for example, a backend-only session
paying to load ~590 lines of mobile-only decisions (ADR-M1–M12) it will never act on, every
time it needed to check one unrelated backend decision.

**Decision.** Split this document into topic files under `adr/` at the project root —
`00-overview.md` (this index — Purpose, Reference Materials, Executive Summary),
`01-backend-decisions.md` (ADR-B1–B9), `02-mobile-decisions.md` (ADR-M1–M12),
`03-cross-cutting-decisions.md` (this file — ADR-X1–X7), `04-tech-stack.md`,
`05-delivery-plan.md`, `06-workflow-and-testing.md`, `07-delivery-and-checklist.md`,
`08-implementation-notes.md`, `09-document-history.md`. Each repo mirrors only the files
relevant to it (backend skips `02-mobile-decisions.md`, mobile skips
`01-backend-decisions.md`; everything else is shared, since it's either small or inherently
cross-cutting).

**Verification the split lost nothing.** Performed mechanically, not by hand-copying: the
original file was cut at exact line boundaries via `sed`, and the resulting files were
concatenated back together and diffed byte-for-byte against the original — confirmed
identical before the original single-file version was retired. This is the ADR-X6
discipline applied to itself: a structural change verified by direct comparison of the
actual resulting state, not by assuming the split was correct because each `sed` command
reported success.

**Rationale.**

1. **A session should only pay for context it can actually act on.** A backend-only task
   has no use for mobile architecture decisions in its context window, and vice versa —
   splitting makes that boundary structural (the file isn't even mirrored into the other
   repo) rather than a matter of self-discipline about what to read.
2. **This is standard practice for any large, AI-loaded reference document** — keep
   unconditionally-loaded context (`CLAUDE.md`) minimal, and make large reference material
   retrievable by topic (grep/targeted read) rather than requiring a full read to answer a
   narrow question. The same principle ADR-X1 already applies to wire contracts and ADR-X5
   applies to who runs which command — applied here to the document that describes them.
3. **A single-file version was not kept in parallel as a "human-readable" copy**, since two
   representations of the same content is exactly the drift risk this project's own mirror
   discipline (this file, the ADR-X1 contracts approach) exists to eliminate. `00-overview.md`
   is the front door for a human reviewer too — its Table of Contents links directly into
   each topic file, so nothing about reviewability was traded away, only the requirement to
   load all of it just to read a piece of it.

**Trade-offs accepted.** Ten files instead of one — a reviewer or session wanting the
complete picture now clicks through an index rather than scrolling one document, and any
future edit needs to land in the correct topic file rather than "somewhere in the ADR." Both
are minor costs against the token savings for the much more common case (a session working
one specific decision or one specific repo).
