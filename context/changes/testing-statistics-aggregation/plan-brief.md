# Statistics Aggregation — Test Bootstrap & Coverage — Plan Brief

> Full plan: `context/changes/testing-statistics-aggregation/plan.md`
> Research: `context/changes/testing-statistics-aggregation/research.md`

## What & Why

Rollout Phase 1 of the test plan, defending **Risk #1** (statistics aggregation is wrong — the user trusts incorrect winrate, counts, opponents, or gear usage). We stand up the project's first test runner and lock the aggregation math with unit tests whose expected values come from product rules, not from the code under test.

## Starting Point

Every statistic is computed inline in the Astro frontmatter of `src/pages/stats/index.astro:42-108` — pure over four input arrays but not callable, and untested. There is no test runner anywhere in the repo (zero `*.test.*` files, no `test` script).

## Desired End State

A pure `src/lib/stats.ts` module holds the aggregation; the stats page imports it and renders byte-identical output. Vitest runs via `npm test`, and `src/lib/stats.test.ts` covers the full edge matrix. The test-plan cookbook (§6.1) documents how to add a unit test in this project.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Where aggregation runs | Inline in the stats page, JS not SQL | Determines the cheapest layer is unit — after extraction | Research |
| Win-rate formula (the oracle) | `wins / total fights` (draws in denominator) | Matches shipped behavior and the common "wins per bout" reading — no code change | Plan |
| Module shape | Small pure fns + a `computeStats()` aggregator | Granular, sharp test failures while the page makes one import | Plan |
| Edge-case coverage | Full 8-case matrix | Strongest signal for the High×High risk; tests are cheap once the harness exists | Plan |
| Extraction fidelity | Preserve exact behavior (incl. `"—"` sentinel) | Zero behavior change keeps a testing phase tightly scoped | Plan |

## Scope

**In scope:** extract aggregation to `src/lib/stats.ts`; rewire the page; add Vitest + `test` script; oracle-driven unit tests; fill test-plan §6.1.

**Out of scope:** CI YAML wiring (rollout Phase 4); any behavior/formula change; data-vs-formatting split; Supabase fetch / RLS / per-user isolation (Phase 3); component/e2e tests; page markup changes.

## Architecture / Approach

Behavior-preserving extract-and-cover. Lift `:42-108` verbatim into named pure functions composed by `computeStats()`; the page destructures its result into the same variable names the markup already binds, so the template is untouched. Vitest runs the framework-free module directly — no jsdom/Astro harness. Tests assert hand-computed literals so the oracle is independent of the implementation.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Extract pure module | `src/lib/stats.ts` + rewired page, no behavior change | Subtle output drift during extraction (gated by a fidelity check) |
| 2. Bootstrap Vitest | `npm test` runs; smoke test green | `@/` path alias not resolving under Vitest |
| 3. Oracle-driven unit tests | Full 8-case matrix passing | Re-introducing the oracle problem by copying impl values |
| 4. Update §6.1 cookbook | Documented unit-test recipe | — |

**Prerequisites:** none — research and decisions are complete.
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- The winrate formula is assumed to match shipped behavior; if product later rules draws out of the denominator, the W/L/D test and `stats.ts` both change together.
- Vitest `@/` alias may need `getViteConfig` from `astro/config` if the bare alias doesn't resolve (called out in Phase 2).

## Success Criteria (Summary)

- The stats page shows the same numbers as before the refactor; the empty state still shows `"—"`.
- `npm test` passes the full edge matrix; flipping the winrate denominator demonstrably breaks the W/L/D test.
- A new contributor can add a unit test by following test-plan §6.1.
