---
change_id: testing-statistics-aggregation
title: Bootstrap test runner and lock statistics aggregation against independent oracles
status: implementing
created: 2026-06-10
updated: 2026-06-10
archived_at: null
---

## Notes

Rollout Phase 1 of `context/foundation/test-plan.md` ("Bootstrap runner + statistics aggregation").

**Risk covered:** Risk #1 — statistics aggregation is wrong (winrate, per-category counts, top-opponents, fight-count-per-gear-item miscomputed; the user trusts incorrect numbers). Scored High × High; named by the user as the area changed most without confidence (interview Q3).

**Test types:** unit (pure aggregation functions). This phase also bootstraps the test runner (Vitest) — the project currently has zero test infrastructure.

**Risk response intent (from test-plan §2 Risk Response Guidance):**
- Prove aggregation outputs match HAND-COMPUTED expected values across win/loss/draw mixes, per-category splits, and fights→sets→items tracing, including empty, single-fight, and no-gear cases.
- Expected values MUST come from an independent oracle (hand-computed fixtures / PRD §Business Logic rules), never from calling or copying the code under test. Guard the **oracle problem**.
- Context for `/10x-research` to ground: where aggregation actually runs (Astro page vs. `src/lib/` vs. SQL), whether the logic is an extractable pure function, and the source-of-truth data shape it consumes.

**Final sub-phase must** update test-plan §6.1 (cookbook: adding a unit test) with the location, naming, reference test, and run command this phase delivers.
