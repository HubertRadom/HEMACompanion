---
project: HEMA Companion
version: 1
status: draft
created: 2026-05-25
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 4
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Individual HEMA (Historical European Martial Arts) practitioners have no dedicated tool for tracking their sparring history and monitoring equipment wear. After every training session, fight records, opponent patterns, and gear condition live entirely in memory or are scattered across informal notes — preventing any meaningful analysis of progress, winrate trends, or gear durability. Practitioners currently use nothing structured; pure verbal recall is the only alternative, and any structured solution clears the bar for immediate usefulness.

HEMA is a niche combat sport, too small for generic fitness or combat-sport apps to serve. Weapon categories (longsword, sabre, rapier), gear sets, and HEMA-specific sparring terminology do not map to any general-purpose tracking tool. Practitioners have no purpose-built solution and adapt nothing in its place — meaning the gap exists not because it was tried and failed, but because the market is too small for generalist products to prioritize.

## User & Persona

**Primary persona:** Individual recreational HEMA practitioner.

A solo practitioner who attends regular training sessions and sparring events. They track their own fights, their own equipment, and their own gear combinations. Their motivation is personal growth — reviewing progress over time, understanding their winrate patterns by weapon discipline, and knowing when their equipment has seen enough use to warrant attention. They are not administering a club, comparing themselves socially, or managing other people's data.

## Success Criteria

### Primary
A practitioner registers, adds at least one gear item, creates a gear set, logs a fight with that gear set, and sees the fight reflected in their statistics. The end-to-end flow — register → add gear → create set → log fight → view stats — completes without data loss.

### Secondary
Most-frequent opponents list is visible in the statistics view. Confirms the app surfaces a meaningful pattern the practitioner could not easily construct from memory.

### Guardrails
- Fight log integrity: no silent data loss on save or edit. A sparring log that silently drops entries is worse than no log at all.
- One practitioner must never see another practitioner's data — enforced at the data layer, not assumed.

## User Stories

### US-01: First fight logged

**Given** a practitioner has registered, added at least one gear item, and created a gear set,
**When** they log a fight selecting that gear set,
**Then** the fight appears in their chronological fight list, their total fight count increases by one, and the win/loss/draw result is reflected in their global and per-weapon winrate.

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

## Non-Functional Requirements

- The statistics view renders within 1 second for any data volume a single practitioner accumulates under normal use (estimated ceiling: ~1,000 fights). A slow stats view breaks the habit loop the product depends on.
- A practitioner can only see data they have personally created. No other practitioner's fights, gear items, or gear sets are visible to them under any circumstances, including edge cases in search or listing operations.

## Business Logic

HEMA Companion computes fight outcomes across sessions, gear, and opponents — turning raw fight logs into patterns the user cannot see in memory alone.

Inputs the rule consumes (as user-visible data):
- Fight records: each fight carries a result (win/loss/draw), weapon category, opponent name, date, and an optional gear set reference.
- Gear set composition: each gear set contains one or more gear items.

Outputs the user encounters:
- Winrate percentages (global and per weapon category) — computed from fight results.
- Most-frequent opponent list — ranked by fight count per opponent name (exact string match).
- Fight count per gear item — derived by tracing fights → gear sets → gear items.
- Usage count per gear set — count of fights referencing that set.

The rule does not recommend actions or infer wear thresholds. It aggregates and surfaces patterns; the user interprets them.

## Access Control

- **Registration and login:** Email and password. No third-party OAuth for MVP.
- **Role model:** Flat — one role (practitioner). Every registered user has identical capabilities, each scoped to their own data only.
- **Data ownership:** All fights, gear items, and gear sets created by a user belong to that user. No user can read, modify, or delete another user's data.
- **Unauthenticated access:** Unauthenticated visitors reach only the registration and login screens. All other routes require an authenticated session.

## Non-Goals

- **No clubs or group accounts; no social features.** No shared rosters, instructor views, comments, friend lists, or activity feeds. The product is solo tracking only. Adding multi-user social dynamics would change the data model and privacy requirements significantly — out of scope indefinitely.
- **No AI or ML features; no advanced analytics beyond the defined stats.** No automated insights, predictions, trend forecasting, or custom dashboards. The domain rule is aggregation, not inference. AI/ML is a future-product concern.
- **No data import, export, or external integrations.** No upload of existing records, sync with external tools, or migration paths. Users start fresh.
- **No gear marketplace, community ratings, or public profiles.** No buying/selling of equipment, community gear reviews, or any public-facing user content.

## Open Questions

None.
