# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-10 (Phase 1 change opened)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data. Here the user named
   statistics aggregation as the area changed most without confidence
   (interview Q3) and silent fight-save loss as the top fear (interview Q1).
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/lib/`, `src/middleware.ts`, `src/pages/api/`, `src/pages/`, `src/components/`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | **Statistics aggregation is wrong** — winrate, per-category counts, top-opponents, or fight-count-per-gear-item is miscomputed; the user trusts incorrect numbers. | High | High | interview Q3 ("roulette"); PRD §Business Logic, FR-016–020; hot-spot dir `src/lib/` (7 commits/30d) + `src/pages/stats/` (2/30d) |
| 2 | **Silent fight-save failure** — a write returns "success" to the UI (the count looks plausible) but the fight never persisted, or persisted partially. | High | Medium | interview Q1; PRD §Success Criteria/Guardrails ("no silent data loss"), FR-012–015; hot-spot dir `src/pages/api/fights/` (4/30d) |
| 3 | **Cross-user data leak (IDOR)** — a handler or RLS policy checks "you are logged in" but not "this row is yours"; one practitioner reads, edits, or deletes another's fights or gear. | High | Medium | PRD §Access Control + NFR data-isolation ("enforced at the data layer, not assumed"); abuse-lens (authorization); hot-spot dir `src/pages/api/` (4/30d) + `src/middleware.ts` (5/30d) |
| 4 | **Protected route exposed** — a middleware regression lets an unauthenticated request reach a data page or API handler. | High | Medium | PRD §Access Control ("all other routes require an authenticated session"); hot-spot dir `src/middleware.ts` (5 commits/30d) |
| 5 | **Server trusts the client** — an invalid result enum, weapon category, or missing required field is accepted because validation lives only in the form, not the handler. | Medium | Medium | abuse-lens (untrusted input); PRD FR-012; hot-spot dir `src/pages/api/` (4/30d) |
| 6 | **No-gear fight cannot save / FK mishandled** — the optional gear-set association is wired as required, or deleting a gear set orphans or breaks the fights that reference it. | Medium | Medium | PRD FR-012 resolution (gear set optional); roadmap S-03 risk note; migrations `fights` + `gear_sets` |

**Impact × Likelihood rubric.** High = user loses access/data/money or the
failure is publicly visible / area changes weekly. Medium = feature degrades
with a workaround, touched occasionally, has produced bugs. Low = cosmetic /
stable code. Order is impact × likelihood; protect High × High (Risk #1) first.

High-impact × Low-likelihood scenarios (e.g. a Supabase or Cloudflare regional
outage) belong to observability/alerting, not a test — they are deliberately
absent from this map rather than padding it.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Aggregation outputs match hand-computed expected values across win/loss/draw mixes, per-category splits, and fights→sets→items tracing (including empty, single-fight, and no-gear cases). | "Expected value = whatever the function returns now." (the oracle problem) | Where aggregation runs (page vs. lib vs. SQL); whether logic is an extractable pure function; the source-of-truth data shape it consumes. | unit (pure functions) | Computing the expected value by calling the code under test or copying its logic into the assertion. |
| #2 | After a "successful" save the row is actually present in the DB with all fields; a DB-rejected write surfaces an error, not a 200. | "Handler returned 200 ⇒ the fight persisted." | The write entry point, the persisted state, and how DB rejection (constraint / null FK) is translated to an HTTP response. | integration (handler → seeded DB) | Asserting the HTTP status instead of asserting persisted DB state. |
| #3 | User A's request for User B's resource is denied (404/403), not served — across read, edit, delete, and list. | "Logged-in ⇒ authorized for this specific row." | Whether ownership is enforced by RLS, handler code, or both; how the user/session identity reaches the query. | integration (two distinct users) | Testing with a single user; trusting RLS without a second-user probe. |
| #4 | An unauthenticated request to a protected page or API redirects / 401s and does not leak data. | "The login page works ⇒ gating works everywhere." | The middleware matcher: which routes are protected, which are public, and how the session is read. | integration (middleware) | Testing only the login page, not the protected data surface. |
| #5 | The server rejects a bad result enum / category / missing field even when the client is bypassed. | "Form validation equals server validation." | Where (if anywhere) the handler validates payloads vs. where the DB enforces constraints. | integration (handler with raw payloads) | Driving validation only through the UI form. |
| #6 | A fight with no gear set saves and appears; deleting a gear set leaves its referencing fights intact per the chosen rule. | "Every fight has a gear set." | The nullability of the gear-set FK and the deletion rule (cascade / set null / restrict) in the migration. | integration | Asserting only the happy path with a gear set attached. |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Bootstrap runner + statistics aggregation | Stand up the test runner and lock the High×High aggregation math against independent oracles | #1 | unit | change opened | context/changes/testing-statistics-aggregation/ |
| 2 | Fight write-path integrity | Prove a "successful" save means a persisted row; no-gear fights save; bad writes surface errors | #2, #6 | integration | not started | — |
| 3 | Authorization & data isolation | Two-user IDOR denied; protected routes gated; server validates independently | #3, #4, #5 | integration | not started | — |
| 4 | Quality-gates wiring + critical-path e2e | Lock lint/typecheck/unit+integration in CI; one e2e on register→gear→set→log→stats | cross-cutting | gates + e2e | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest | TBD — see §3 Phase 1 | None yet. Astro/Vite-native; first runner bootstrapped in Phase 1. Verify exact version against current Astro 6 + Vite 7 at research time. |
| API / DB harness | none yet — see §3 Phase 2 | — | Integration tests need a way to exercise handlers against a real/seeded Supabase schema; harness chosen during Phase 2 research. |
| e2e | none yet — see §3 Phase 4 | — | Playwright is the likely candidate for the single critical-path flow; deferred until the suite has substance. |
| (optional) AI-native | multimodal visual review — checked: 2026-06-10 | n/a | **When NOT to use:** any assertion the aggregation unit tests in Phase 1 already cover. Reserved for the single stats dashboard screen, if at all. |

**Stack grounding tools (current session):**
- Docs: none (Context7 / framework docs MCP not available in current session) — relied on local `package.json` (Astro 6.3, React 19.2, Vitest not yet present, `@supabase/ssr` 0.10, `supabase` CLI 2.23); checked: 2026-06-10
- Search: web search available in session but not used for this write — confirm Vitest + Astro 6 setup at Phase 1 research; checked: 2026-06-10
- Runtime/browser: Playwright MCP not available in current session — note as the likely e2e tool for Phase 4; checked: 2026-06-10
- Provider/platform: Supabase MCP + `supabase` skill available — relevant for grounding RLS/schema in Phase 2/3 research (verify ownership policies, FK nullability, deletion rules); Cloudflare deploy via wrangler (CI gate target for Phase 4); checked: 2026-06-10

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local (husky/lint-staged) + CI | required (already wired: eslint + `astro check`) | syntactic / type drift |
| unit | local + CI | required after §3 Phase 1 | aggregation logic regressions |
| integration | local + CI | required after §3 Phase 2 | write-path + authorization regressions |
| e2e on critical flow | CI on PR | required after §3 Phase 4 | broken register→gear→set→log→stats path |
| post-edit hook | local (agent loop) | recommended after §3 Phase 1 | regressions at edit time |
| multimodal visual review | CI on PR | optional (stats dashboard only) | visual issues classic diff misses |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- TBD — see §3 Phase 1 (statistics aggregation: winrate / per-category count / fights→sets→items tracing, asserted against hand-computed oracles, never against the code under test).

### 6.2 Adding an integration test

- TBD — see §3 Phase 2 (fight write-path: assert persisted DB state after a save, not the HTTP status; no-gear fight and FK-rejection cases).

### 6.3 Adding a test for an API endpoint / authorization

- TBD — see §3 Phase 3 (two-user IDOR probe: User A must not read/edit/delete User B's rows; protected-route gating; server-side payload validation).

### 6.4 Adding an e2e test

- TBD — see §3 Phase 4 (single critical-path flow: register → add gear → create set → log fight → view stats).

### 6.5 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note here capturing anything surprising the phase taught — e.g. where the aggregation logic actually lived, or what harness the integration tests needed.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout. Future contributors should respect
these unless the underlying assumption changes.

- **Supabase auth primitives (signIn / signUp / signOut)** — vetted starter code; we test our authorization (ownership) and route gating, not the auth library itself. Re-evaluate if we customize the auth flow. (Source: synthesis default; interview Q5 gave no specific exclusion.)
- **UI snapshot tests for gear / fight forms** — brittle on Tailwind churn, low signal. Re-evaluate if a form acquires real client-side logic worth pinning. (Source: synthesis default.)
- **Exhaustive CRUD permutations on simple tables** — low blast radius; covered indirectly by the write-path and authorization integration tests. Re-evaluate if a table gains complex constraints. (Source: synthesis default.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-10
- Stack versions last verified: 2026-06-10
- AI-native tool references last verified: 2026-06-10

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
