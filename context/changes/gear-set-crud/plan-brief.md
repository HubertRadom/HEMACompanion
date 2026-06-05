# Gear Set CRUD — Plan Brief

> Full plan: `context/changes/gear-set-crud/plan.md`

## What & Why

Implement gear set CRUD at `/gear-sets` — the second HEMA domain slice. A gear set is a named collection of gear items that represents a full equipment loadout (e.g., "Tournament Longsword Kit"). It is a first-class concept in the PRD because practitioners think in terms of loadouts, not individual items, when logging fights. Without sets, the sparring log (S-03) cannot associate gear with fights.

## Starting Point

`gear_items`, `AppLayout`, `AppNav` (with Gear Sets stubbed as a disabled span), and the SSR CRUD pattern (POST → redirect) are all in place from S-01. The `gear_sets` and `gear_set_compositions` tables do not yet exist. The "Gear Sets" nav link is grayed out.

## Desired End State

Authenticated users can navigate to `/gear-sets` via a live nav link, create named sets by checking gear items from their inventory, edit the name and composition, and delete sets. The list page shows each set's name alongside its comma-joined item names. The Gear Sets section is fully CRUD-capable and RLS-enforced, ready to be referenced by the sparring log in S-03.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Composition UI | Inline checkbox list | Follows native form POST pattern; no extra JS; valid at MVP item counts | Plan |
| Empty set validation | Require ≥ 1 item | Aligns with PRD FR-008 phrasing; prevents dangling sets appearing in the S-03 fight form | Plan |
| Gear item delete impact | ON DELETE CASCADE | Matches the hard-delete-is-acceptable precedent from S-01 (FR-007) | Plan |
| List display | Name + comma-joined item names | User sees composition at a glance; single nested select query | Plan |
| No-items edge case | Inline empty state + CTA | User stays in context; understands the S-01 dependency without a jarring redirect | Plan |
| Success redirect | Back to /gear-sets list | Consistent with gear item CRUD behavior established in S-01 | Plan |
| RLS on compositions | EXISTS subquery (no denormalized user_id) | Preserves normalized schema; ownership already encoded in gear_sets | Plan |
| Phase structure | 3 phases: DB+Nav / API / UI | Smallest independently-verifiable increments; AppLayout already exists from S-01 | Plan |

## Scope

**In scope:**
- `gear_sets` and `gear_set_compositions` DB tables + RLS + updated_at trigger
- `/gear-sets`, `/gear-sets/add`, `/gear-sets/[id]/edit` pages
- API routes: create, update, delete
- `GearSetForm` React component with inline checkboxes
- AppNav Gear Sets link activation
- Middleware protection for `/gear-sets`
- `GearSet` and `GearSetComposition` type definitions

**Out of scope:**
- `fights` table (S-03)
- Gear set categories / types
- Ordered composition items
- Pagination
- Undo / soft-delete

## Architecture / Approach

Same SSR-first stack as S-01: Astro page frontmatters fetch data server-side, mutations go through `POST` API routes, React islands provide client-side validation only. The new complexity is the many-to-many join table: `gear_set_compositions(gear_set_id, gear_item_id)` with cascade FKs in both directions. The create and update API routes read `formData.getAll("item_ids")` for the checked box values. Update uses delete-then-reinsert for composition replacement. The list and edit pages use Supabase's nested select to fetch compositions with gear item details in one request.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. DB Schema, Types, Navigation | gear_sets + gear_set_compositions deployed; AppNav live; /gear-sets protected | RLS subquery policy on join table — must be verified in dashboard |
| 2. API Routes | Create / update / delete endpoints following defensive S-01 patterns | Composition update uses upsert-then-delete — non-atomic but failure-safe (set never goes empty) |
| 3. UI Pages | GearSetForm + list / add / edit pages; all manual scenarios verified | Cascade behavior (item delete → set loses item) must be tested explicitly |

**Prerequisites:** S-01 complete (gear items and the SSR pattern must exist before this plan starts)
**Estimated effort:** ~1-2 sessions across 3 phases

## Open Risks & Assumptions

- The `set_updated_at()` trigger function is already deployed (migration 0001). If for any reason it was rolled back, the migration will fail.
- The S-03 `fights` table will reference `gear_sets.id` with a nullable FK using `ON DELETE SET NULL`. This constraint is not in scope here — it must be handled in S-03's migration to avoid broken references when a set is deleted after fights are logged.
- Composition update uses upsert-then-delete (not delete-then-insert), so a mid-sequence Supabase failure leaves the set with either stale extra items or missing new ones — never empty. Not fully atomic, but not catastrophic.

## Success Criteria (Summary)

- User can create a named gear set with checked items, see it in the list with item names, edit its name and composition, and delete it — all from the AppNav "Gear Sets" link.
- A second user cannot access the first user's sets; a non-existent or other-user's set edit URL redirects with an error.
- Deleting a gear item that is part of a set causes the set to show "No items" (cascade confirmed).
