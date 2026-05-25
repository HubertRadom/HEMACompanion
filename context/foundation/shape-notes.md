---
project: HEMA Companion
context_type: greenfield
updated: 2026-05-25
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 20
  quality_check_status: accepted
product_type: web-app
target_scale:
  users: medium
timeline_budget:
  mvp_weeks: 4
  after_hours_only: true
  hard_deadline: null
---

## Vision & Problem Statement

**One-sentence problem:** HEMA practitioners have no dedicated tool for systematically tracking sparring history and equipment wear — information lives in memory or scattered notes, making progress analysis and gear durability assessment impossible.

**Pain:** Practitioners can't recall fight history, analyze winrate trends, or know when equipment is nearing its wear limit.

**Person:** Individual recreational HEMA practitioner — tracking their own sparring for personal growth.

**Moment:** After training sessions or before tournaments, when they want to review progress, recall past fights, or estimate gear condition.

**Cost today:** Pure memory / verbal recall. No alternative tool in use — any structured solution beats the status quo.

**Insight:** HEMA is a niche sport, too small for generic fitness or combat-sport apps to target. Weapon categories, gear sets, and sparring terminology are HEMA-specific; practitioners have no purpose-built tool and adapt nothing instead.

## User & Persona

**Primary persona:** Individual recreational HEMA practitioner.
- Solo user — data is personal, not shared.
- Tracks own fights, own gear, own sets.
- Motivation: personal growth tracking, not club administration or social comparison.

## Access Control

- **Auth model:** Email + password registration and login. No OAuth for MVP.
- **Role model:** Flat — one role (practitioner). Every registered user has identical access to their own data only.
- **Data ownership:** All fights, gear, and gear sets are scoped to the individual user. No shared or cross-user data visibility.

## Success Criteria

### Primary
A practitioner registers, adds at least one gear item, creates a gear set, logs a fight with that set, and sees the fight reflected in their statistics. End-to-end flow proven: register → gear → set → fight → stats.

### Secondary
Most-frequent opponents list visible in the stats view. Low implementation cost, satisfying first insight — shows the app knows who you fight most.

### Guardrails
- Fight log integrity: no silent data loss on save or edit. A sparring log that silently drops entries is worse than no log.
- (Implied by access control): one user must never see another user's data — enforced at the data layer, not assumed.

## Functional Requirements

### Authentication
- FR-001: Practitioner can register with email and password. Priority: must-have
  > Socrates: Counter-argument considered: skip auth for MVP, use local-only data. Resolution: kept; data must be personal and server-side from day one — local-only doesn't serve cross-session, cross-device tracking.
- FR-002: Practitioner can log in with email and password. Priority: must-have
- FR-003: Practitioner can log out. Priority: must-have

### Gear Tracker
- FR-004: Practitioner can add a gear item with name, type/category, and optional brand/model. Priority: must-have
- FR-005: Practitioner can view a list of their own gear items. Priority: must-have
- FR-006: Practitioner can edit a gear item. Priority: must-have
- FR-007: Practitioner can delete a gear item. Priority: must-have
  > Socrates: Counter-argument considered: soft-delete / archive to prevent accidental data loss. Resolution: kept as hard delete; CRUD is table stakes; no undo is acceptable for MVP.

### Gear Sets
- FR-008: Practitioner can create a gear set with a name and assign multiple gear items to it. Priority: must-have
  > Socrates: Counter-argument considered: skip gear set abstraction, reference items directly on each fight. Resolution: kept; gear sets are a first-class concept — "I used my longsword loadout" is core UX, not convenience.
- FR-009: Practitioner can view a list of their own gear sets. Priority: must-have
- FR-010: Practitioner can edit a gear set (name and item composition). Priority: must-have
- FR-011: Practitioner can delete a gear set. Priority: must-have

### Sparring Log
- FR-012: Practitioner can log a fight with opponent name (free text), weapon category, result (win / loss / draw), date, and an optionally associated gear set. Priority: must-have
  > Socrates: Counter-argument accepted: forcing gear set on every fight frustrates retroactive logging and no-gear training sessions. Revised: gear set association is optional. Gear stats only surface when a set is present.
- FR-013: Practitioner can view their fights in chronological order. Priority: must-have
- FR-014: Practitioner can edit a logged fight. Priority: must-have
- FR-015: Practitioner can delete a logged fight. Priority: must-have

### Statistics
- FR-016: Practitioner can view total fight count (global and per weapon category). Priority: must-have
- FR-017: Practitioner can view win rate (global and per weapon category). Priority: must-have
  > Socrates: Counter-argument considered: per-category stats are meaningless with sparse data (1 fight = 100% winrate). Resolution: ship unconditionally — users understand context, implementation is simpler, and sparse data is still true data.
- FR-018: Practitioner can view most-frequent opponents list. Priority: must-have
- FR-019: Practitioner can view fight count per gear item ("this sword used in 25 fights"). Priority: must-have
- FR-020: Practitioner can view usage count per gear set. Priority: must-have
  > Socrates: Counter-argument considered: aggregation stats add backend complexity, could defer to v2. Resolution: kept as must-have; gear stats and opponent patterns are the payoff for logging — without them the tracker is just a diary.

## User Stories

### US-01: First fight logged
**Given** a practitioner has registered, added at least one gear item, and created a gear set,
**When** they log a fight selecting that gear set,
**Then** the fight appears in their chronological fight list, their total fight count increases by one, and the win/loss/draw result is reflected in their global and per-weapon winrate.

## Business Logic

**Domain rule:** HEMA Companion computes fight outcomes across sessions, gear, and opponents — turning raw fight logs into patterns the user cannot see in memory alone.

Inputs the rule consumes (as user-visible data):
- Fight records: each fight carries a result (win/loss/draw), weapon category, opponent name, date, and an optional gear set reference.
- Gear set composition: each gear set contains one or more gear items.

Outputs the user encounters:
- Winrate percentages (global and per weapon category) — computed from fight results.
- Most-frequent opponent list — ranked by fight count per opponent name (exact string match).
- Fight count per gear item — derived by tracing fights → gear sets → gear items.
- Usage count per gear set — count of fights referencing that set.

The rule does not recommend actions or infer wear thresholds. It aggregates and surfaces patterns; the user interprets them.

## Non-Functional Requirements

- **Response time:** statistics page loads and renders under 1 second for any data volume a single user would accumulate under normal use (up to ~1000 fights). This is an externally observable constraint — a slow stats view breaks the habit loop.
- **Data isolation:** a user's data must never appear in another user's API response or view, regardless of how the data is queried. Externally observable: if user A can ever see user B's fights, the product has failed.

## Non-Goals

- **No clubs or group accounts, no social features.** No shared rosters, instructor views, comments, friend lists, or activity feeds. The product is solo tracking only. Adding multi-user social dynamics would change the data model and privacy requirements significantly — out of scope indefinitely.
- **No AI / ML features or advanced analytics.** No automated insights, predictions, trend forecasting, or custom dashboards beyond the defined stats. The domain rule is aggregation, not inference — AI/ML is a future-product concern.
- **No data import, export, or external integrations.** No CSV upload, API sync, or migration paths from other tools. Users start fresh.
- **No gear marketplace, community ratings, or public profiles.** No buying/selling, gear reviews by community, or any public-facing user content.

## Quality cross-check

All six greenfield quality gates passed on 2026-05-25.

| Element | Status |
|---|---|
| Access Control | present |
| Business Logic (one-sentence rule) | present |
| Project artifacts | present |
| Timeline-cost acknowledged | present (4 weeks, within threshold) |
| Non-Goals | present (4 entries) |

