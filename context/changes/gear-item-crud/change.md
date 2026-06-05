---
change_id: gear-item-crud
roadmap_id: S-01
title: Gear item CRUD
status: implementing
created: 2026-06-05
updated: 2026-06-05
prd_refs: FR-004, FR-005, FR-006, FR-007
prerequisites: F-01 (scoped to gear_items only — see plan.md)
---

## Outcome

User can add a gear item with name, category, and optional brand/model; view their own gear item list; edit a gear item; and delete a gear item.

## Notes

F-01 (db-schema-rls) was intended as a standalone foundation change deploying all four domain tables at once. This plan scopes it down: only the `gear_items` table and its RLS policies are deployed here. Remaining tables (gear_sets, gear_set_compositions, fights) land with S-02 and S-03 respectively.

This slice also establishes the app-wide navigation shell (AppLayout + AppNav) and the SSR CRUD pattern (form → POST API route → redirect) that S-02 and S-03 will reuse.
