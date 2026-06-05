---
project: HEMA Companion
version: 1
status: draft
created: 2026-06-04
updated: 2026-06-04
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: HEMA Companion

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

HEMA practitioners have no dedicated tool to track sparring history and gear usage — progress, winrate trends, and equipment wear live entirely in memory or scattered notes. HEMA Companion gives individual practitioners a personal, server-side sparring log with gear tracking and pattern statistics, purpose-built for a niche sport whose weapon categories and terminology don't map to any general-purpose fitness app. Any structured solution beats the current status quo of pure verbal recall.

## North star

**S-04: user can view fighting statistics and see their first fight reflected in winrate and opponent patterns** — completing the primary success criterion ("register → add gear → create set → log fight → view stats") and proving the full tracking loop works end-to-end.

> The north star — the smallest end-to-end slice that, if shipped, proves the product works as intended — is placed as early as its dependencies allow. For HEMA Companion, S-04 is that slice: shipping the statistics view, populated by real logged fights, is the moment the product's central bet — that a practitioner will form a logging habit once the full tracking loop works — is either confirmed or disproven.

## At a glance

| ID   | Change ID            | Outcome (user can …)                                         | Prerequisites | PRD refs                               | Status   |
| ---- | -------------------- | ------------------------------------------------------------ | ------------- | -------------------------------------- | -------- |
| F-01 | db-schema-rls        | (foundation) schema deployed + RLS enforcing data isolation  | —             | FR-001, FR-002, FR-003                 | partial (gear_items deployed in S-01; remaining tables land in S-02/S-03) |
| S-01 | gear-item-crud       | add, view, edit, and delete gear items                       | F-01          | FR-004, FR-005, FR-006, FR-007         | implemented |
| S-02 | gear-set-crud        | create, view, edit, and delete gear sets                     | F-01, S-01    | FR-008, FR-009, FR-010, FR-011         | implemented |
| S-03 | sparring-log-crud    | log, view, edit, and delete fights                           | F-01, S-01    | FR-012, FR-013, FR-014, FR-015, US-01  | implemented (impl_reviewed 2026-06-05) |
| S-04 | statistics-dashboard | view fight count, winrate, top opponents, and gear usage     | S-02, S-03    | FR-016, FR-017, FR-018, FR-019, FR-020 | implemented (impl_reviewed 2026-06-05) |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme              | Chain                              | Note                                                              |
| ------ | ------------------ | ---------------------------------- | ----------------------------------------------------------------- |
| A      | Gear infrastructure | `F-01` → `S-01` → `S-02` → `S-04` | Critical path to north star; S-04 joins with Stream B at the end. |
| B      | Sparring log        | `S-03`                             | Parallel with `S-02` after `S-01` lands; joins Stream A at `S-04`. |

## Baseline

What's already in place in the codebase as of `2026-06-04` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro + React, file-based routing (`src/pages/`), auth pages + dashboard, UI components in `src/components/`
- **Backend / API:** partial — auth API routes (`src/pages/api/auth/`) and middleware (`src/middleware.ts`); no HEMA domain handlers for fights, gear, or statistics
- **Data:** partial — Supabase client initialized (`src/lib/supabase.ts`); no schema or migration files
- **Auth:** present — full Supabase auth stack: signIn/signUp/signOut (`src/pages/api/auth/`), route-protection middleware (`src/middleware.ts`)
- **Deploy / infra:** partial — GitHub Actions CI (`.github/workflows/ci.yml`) + Cloudflare Workers deploy (`wrangler.jsonc`); no containerization
- **Observability:** absent — no logging library, error tracker, or monitoring integration

## Foundations

### F-01: Database schema and RLS policies

- **Outcome:** (foundation) schema deployed with tables for gear items, gear sets, gear set compositions, and fights; RLS policies enforce per-user data isolation so no user can read or modify another user's rows.
- **Change ID:** `db-schema-rls`
- **PRD refs:** FR-001, FR-002, FR-003 (auth model that RLS policies are built against), NFR: data-isolation ("a user's data must never appear in another user's API response or view")
- **Unlocks:** S-01, S-02, S-03 (all domain CRUD slices require the schema contract to exist); the data-isolation NFR becomes verifiable only once RLS is in place
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced first because every subsequent slice assumes the schema contract. If RLS is mis-scoped — missing a table or using `auth.uid()` incorrectly — all downstream slices inherit the flaw silently. Catching it at the foundation stage is far cheaper than retrofitting across four slices.
- **Status:** partial — `gear_items` table + RLS policies deployed as part of `gear-item-crud` (S-01). Remaining tables (`gear_sets`, `gear_set_compositions`, `fights`) land in S-02 and S-03 respectively.

## Slices

### S-01: Gear item CRUD

- **Outcome:** user can add a gear item with name, category, and optional brand/model; view their own gear item list; edit a gear item; and delete a gear item.
- **Change ID:** `gear-item-crud`
- **PRD refs:** FR-004, FR-005, FR-006, FR-007
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** First HEMA domain slice — it establishes the UI pattern (form → list → edit → delete) that S-02 and S-03 replicate. A mistake in the pattern here propagates forward into both parallel slices.
- **Status:** implemented (impl_reviewed 2026-06-05)

### S-02: Gear set CRUD

- **Outcome:** user can create a gear set with a name and assign multiple gear items to it; view their own gear sets; edit a set's name and item composition; and delete a gear set.
- **Change ID:** `gear-set-crud`
- **PRD refs:** FR-008, FR-009, FR-010, FR-011
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Gear set composition is the most relational piece of the schema (many-to-many between sets and items). If the join table structure deviates from what F-01 established, the cascades and stats aggregation queries in S-04 break.
- **Status:** implemented (impl_reviewed 2026-06-05)

### S-03: Sparring log CRUD

- **Outcome:** user can log a fight with opponent name, weapon category, result (win/loss/draw), date, and an optional gear set; view fights in chronological order; edit a logged fight; and delete a logged fight.
- **Change ID:** `sparring-log-crud`
- **PRD refs:** FR-012, FR-013, FR-014, FR-015, US-01
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Gear set association is optional (per PRD FR-012 resolution), so fights must be saveable without a set. If the nullable FK is incorrectly wired as required, retroactive and no-gear fight logging breaks — and silent data loss is the PRD's primary guardrail.
- **Status:** implemented (impl_reviewed 2026-06-05)

### S-04: Statistics dashboard

- **Outcome:** user can view total fight count (global and per weapon category), win rate (global and per weapon category), most-frequent opponents list, fight count per gear item, and usage count per gear set.
- **Change ID:** `statistics-dashboard`
- **PRD refs:** FR-016, FR-017, FR-018, FR-019, FR-020
- **Prerequisites:** S-02, S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Performance NFR requires stats to render under 1 second for up to ~1,000 fights. The gear item fight count (tracing fights → gear sets → gear items) involves a multi-step join; at MVP data volumes this should be fine with indexed FKs, but worth verifying before claiming the NFR met.
- **Status:** implemented (impl_reviewed 2026-06-05)

## Backlog Handoff

| Roadmap ID | Change ID            | Suggested issue title                             | Ready for `/10x-plan` | Notes                                       |
| ---------- | -------------------- | ------------------------------------------------- | --------------------- | ------------------------------------------- |
| F-01       | db-schema-rls        | Define DB schema and RLS policies                 | yes                   | Run `/10x-plan db-schema-rls`               |
| S-01       | gear-item-crud       | Gear item CRUD (add / list / edit / delete)       | no                    | Depends on F-01                             |
| S-02       | gear-set-crud        | Gear set CRUD (create / list / edit / delete)     | no                    | Depends on F-01, S-01; parallel with S-03   |
| S-03       | sparring-log-crud    | Sparring log CRUD (log / list / edit / delete)    | no                    | Depends on F-01, S-01; parallel with S-02   |
| S-04       | statistics-dashboard | Statistics dashboard (winrate / opponents / gear) | no                    | Depends on S-02, S-03; north star           |

## Open Roadmap Questions

None — PRD `## Open Questions` is empty; the framing interview surfaced no cross-cutting unknowns.

## Parked

- **Clubs, group accounts, shared rosters, social features** — Why parked: PRD §Non-Goals; multi-user social dynamics would change the data model and privacy requirements significantly.
- **AI / ML features, advanced analytics beyond defined stats** — Why parked: PRD §Non-Goals; domain rule is aggregation, not inference; AI/ML is a future-product concern.
- **Data import, export, or external integrations** — Why parked: PRD §Non-Goals; users start fresh for MVP.
- **Gear marketplace, community ratings, public profiles** — Why parked: PRD §Non-Goals; no public-facing user content in scope.
- **Observability (structured logging, error tracking)** — Why parked: no must-have PRD FR; speed/time goals mean no extras for MVP.

## Done

(Empty on first generation. `/10x-archive` appends an entry here when a change whose Change ID matches a roadmap item is archived.)
