---
change_id: gear-set-crud
roadmap_id: S-02
title: Gear set CRUD
status: implementing
created: 2026-06-05
updated: 2026-06-05
prd_refs: FR-008, FR-009, FR-010, FR-011
prerequisites: F-01 (partial — gear_items only, landed in S-01), S-01
---

## Outcome

User can create a gear set with a name and assign multiple gear items to it; view their own gear sets with item names; edit a set's name and item composition; and delete a gear set.

## Notes

Deploys the remaining F-01 tables scoped to gear: `gear_sets` and `gear_set_compositions`. The `fights` table lands in S-03.

Gear set composition uses a many-to-many join table (`gear_set_compositions`) with cascade deletes in both directions: deleting a gear set cascades to its compositions; deleting a gear item cascades to any compositions referencing it (sets may silently drop items).

Activates the "Gear Sets" nav link that was stubbed in S-01's AppNav.
