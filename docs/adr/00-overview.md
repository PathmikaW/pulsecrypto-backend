# PulseCrypto — Architecture Decision Record

### Real-Time Cryptocurrency Market Viewer — Technical Design & Rationale

**Document type:** Architecture Decision Record (ADR)
**Version:** 9.3
**Status:** Approved for implementation — reconciled against the completed solution (v9.1); where an earlier section describes a design that was not built, a dated note says so

---

## Purpose of This Document

This document records the architectural decisions behind PulseCrypto ahead of implementation, in the format of a standard Architecture Decision Record: for each significant technical choice, it captures the options considered, the decision made, the rationale, and the trade-offs knowingly accepted.

The reasoning behind a decision is what makes it possible to evaluate, maintain, and safely change later — the goal is that another engineer can see not just what was built, but why, and what alternatives were weighed and rejected.

Two inputs shaped every decision below: the assignment's explicit functional and non-functional requirements, and the broader engineering expectations described in the Staff Engineer / Architect – Mobile Apps role. Where a minimal implementation and a production-grade one would diverge, this document is explicit about which was chosen and why — the target throughout was a design defensible as something that could genuinely ship, not one scoped only to satisfy a checklist. Equally, where a production-grade pattern would have introduced complexity or risk disproportionate to what it protects against in this specific context, that's stated plainly too — production-grade thinking includes knowing when _not_ to add a layer, not only when to add one.

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

**This ADR is split into topic files — read only the one(s) your current task needs, not
all of them.** This file (the overview) plus the relevant decision file is almost always
enough; the rest (delivery plan, checklist, document history) matter mainly for planning
and pre-submission work, not day-to-day implementation. See ADR-X7 in
`03-cross-cutting-decisions.md` for the full rationale behind this split.

**This overview file is identical in all three locations it lives** — the project root
(`adr/00-overview.md`, the source) and both repos' mirrors (`docs/adr/00-overview.md`) — so
the links below only resolve to files actually present in whichever copy you're reading.
That's intentional, not a broken mirror: each repo only carries the topic files relevant to
it (backend skips mobile decisions, mobile skips backend decisions), noted per line below.

1. Executive Summary — this file, below
2. [Backend Architecture Decisions](01-backend-decisions.md) — ADR-B1–B9. **Backend repo + project root only** — not mirrored into `pulsecrypto-mobile`.
3. [Mobile Architecture Decisions](02-mobile-decisions.md) — ADR-M1–M12. **Mobile repo + project root only** — not mirrored into `pulsecrypto-backend`.
4. [Cross-Cutting Decisions](03-cross-cutting-decisions.md) — ADR-X1–X7. All three locations — read when touching git/CI/contracts/deployment/scaffolding/session process.
5. [Technology Stack Summary](04-tech-stack.md) — versions, env vars. All three locations.
6. [Delivery Plan](05-delivery-plan.md) — phase sequence. All three locations.
7. [Development Workflow & Testing Strategy](06-workflow-and-testing.md) — spec-driven development, test coverage expectations. All three locations.
8. [README, Deliverables & Final Checklist](07-delivery-and-checklist.md) — relevant near submission, not during day-to-day implementation. All three locations.
9. [Implementation Notes — Precision Details](08-implementation-notes.md) — six easy-to-get-subtly-wrong details, worth a check regardless of which feature you're on. All three locations.
10. [Document History](09-document-history.md) — full version-by-version change log. All three locations.

Within any file, if you only need one specific decision (e.g. ADR-B4), `grep -n "^### ADR-B4"`
that file and read just that section with `offset`/`limit` — these files are still long
enough that reading one end-to-end for a single-decision question costs more than it needs
to.

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
