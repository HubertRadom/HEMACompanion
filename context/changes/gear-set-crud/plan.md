# Gear Set CRUD Implementation Plan

## Overview

Implement gear set CRUD (create / list / edit / delete) at `/gear-sets` as the second HEMA domain slice. Deploys the `gear_sets` and `gear_set_compositions` tables (the remaining F-01 schema scoped to gear). Activates the "Gear Sets" stub in AppNav. Follows the SSR + POST → redirect + React island pattern established in S-01.

## Current State Analysis

- `gear_items` table and its RLS policies are deployed. `AppLayout`, `AppNav` (with Gear Sets stubbed as `<span>`), and the SSR CRUD pattern are all in place from S-01.
- No `gear_sets` or `gear_set_compositions` tables exist yet.
- `src/lib/types.ts` defines `GearItem`; no gear set types yet.
- `src/middleware.ts` protects `/dashboard` and `/gear`; `/gear-sets` is not yet guarded.
- The `set_updated_at()` trigger function is deployed (migration 0001) and can be reused.
- Impl-review of S-01 surfaced three defensive patterns that this plan must carry forward: explicit `.eq("user_id", user.id)` on all page-level queries, application-layer user ownership checks in all mutation routes, and DB error surfacing via a consolidated `error` variable.

### Key Discoveries

- `src/components/AppNav.astro` — "Gear Sets" is a `<span class="text-white/25">` stub; becomes `<a href="/gear-sets">` with the same active-state logic as the existing Gear link.
- `src/middleware.ts:4` — `PROTECTED_ROUTES` array; append `"/gear-sets"`.
- `src/lib/supabase.ts` — `createClient(requestHeaders, cookies)` factory; pattern unchanged.
- Supabase PostgREST nested select (`gear_set_compositions(gear_items(id, name, category))`) retrieves set composition in a single request; used on the list and edit pages.
- `formData.getAll("item_ids")` — the native way to read multiple checkbox values with the same name from a submitted form; used in create and update API routes.
- `supabase/migrations/20260605000001_gear_items_updated_at_trigger.sql` — deploys `set_updated_at()` and `moddatetime` extension. The same trigger function is referenced in the new migration; no re-creation needed.

## Desired End State

- Authenticated users can navigate to `/gear-sets` via AppNav (previously stubbed link now live).
- `/gear-sets` lists the user's gear sets with set name and comma-separated gear item names; friendly empty state when none exist.
- Users can create a set at `/gear-sets/add`, choosing a name and checking off gear items from their existing inventory; at least one item is required.
- Users can edit a set's name and composition at `/gear-sets/[id]/edit`; existing items are pre-checked.
- Users can delete a set from the list with a browser confirm dialog.
- All operations are RLS-enforced at both the DB and application layers.
- Deleting a gear item (S-01 flow) automatically removes it from any sets via `ON DELETE CASCADE`; sets may fall to zero items silently.

## What We're NOT Doing

- `fights` table — lands in S-03.
- Gear set categories or types — PRD specifies only a name field.
- Ordered composition items — no sequencing within a set.
- Pagination on the gear set list — item count per user is small at MVP scale.
- Undo / soft-delete — hard delete is correct per PRD FR-011.
- Supabase type generation — still deferred to S-04 when all tables exist.
- "Gear set detail" view (read-only) — the edit page serves as the detail view.

## Implementation Approach

Same SSR-first approach as S-01: Astro pages fetch data server-side, mutations go through POST API routes, React islands handle client-side validation only. The key new challenge is the many-to-many composition: the create/update API routes read `formData.getAll("item_ids")` to collect checked boxes, insert rows into `gear_set_compositions`, and on update delete-then-reinsert all compositions for the set. RLS on `gear_set_compositions` uses a subquery-based policy (checks ownership via the parent `gear_sets` row) rather than a denormalized `user_id` column.

---

## Phase 1: Database Schema, Types, and Navigation

### Overview

Deploy `gear_sets` and `gear_set_compositions` tables with RLS and the `updated_at` trigger. Add `GearSet` and `GearSetComposition` types. Activate the Gear Sets nav link and add `/gear-sets` to middleware protection.

### Changes Required

#### 1. Migration file

**File**: `supabase/migrations/20260605000002_gear_sets.sql`

**Intent**: Define `gear_sets` and `gear_set_compositions` tables, enable RLS on both, and attach the existing `set_updated_at()` trigger to `gear_sets`. This is the last schema migration before S-03 adds `fights`.

**Contract**:

`gear_sets` columns: `id` (uuid pk, `gen_random_uuid()`), `user_id` (uuid not null, references `auth.users(id)` on delete cascade), `name` (text not null), `created_at` / `updated_at` (timestamptz not null, default `now()`). Four RLS policies identical to `gear_items` (SELECT / INSERT / UPDATE / DELETE using `auth.uid() = user_id`; UPDATE uses both USING and WITH CHECK). Trigger: `CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.gear_sets FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at()`.

`gear_set_compositions` columns: `id` (uuid pk, `gen_random_uuid()`), `gear_set_id` (uuid not null, references `public.gear_sets(id)` on delete cascade), `gear_item_id` (uuid not null, references `public.gear_items(id)` on delete cascade), `created_at` (timestamptz not null, default `now()`). Unique constraint on `(gear_set_id, gear_item_id)`. Three RLS policies (SELECT / INSERT WITH CHECK / DELETE), each using an EXISTS subquery: `EXISTS (SELECT 1 FROM public.gear_sets WHERE gear_sets.id = gear_set_compositions.gear_set_id AND gear_sets.user_id = auth.uid())`. No UPDATE policy — compositions are replaced via delete-then-insert.

Apply via `npx supabase db push` or paste SQL into Supabase dashboard SQL editor.

#### 2. Type definitions

**File**: `src/lib/types.ts`

**Intent**: Add `GearSet` and `GearSetComposition` interfaces for use by page frontmatters and the form component.

**Contract**: Append two interfaces. `GearSet`: `id: string`, `user_id: string`, `name: string`, `created_at: string`, `updated_at: string`. `GearSetComposition`: `id: string`, `gear_set_id: string`, `gear_item_id: string`, `created_at: string`.

#### 3. Middleware route protection

**File**: `src/middleware.ts`

**Intent**: Add `/gear-sets` to the protected routes list so the existing auth guard covers the new section.

**Contract**: Append `"/gear-sets"` to the `PROTECTED_ROUTES` array.

#### 4. AppNav — activate Gear Sets link

**File**: `src/components/AppNav.astro`

**Intent**: Replace the disabled "Gear Sets" `<span>` stub with a live `<a href="/gear-sets">` that follows the same active-state logic as the Gear link.

**Contract**: Replace the `<span class="text-white/25">Gear Sets</span>` element with an `<a>` whose active class is applied when `Astro.url.pathname.startsWith('/gear-sets')`. Follow the same conditional class pattern used by the existing Gear nav item.

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npx supabase db push` exits with no errors
- TypeScript check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification

- `gear_sets` and `gear_set_compositions` tables visible in Supabase dashboard → Table Editor
- RLS enabled on both tables; correct policies listed
- `gear_set_compositions` has unique constraint on `(gear_set_id, gear_item_id)` and cascade FKs to both `gear_sets` and `gear_items`
- Navigating to `/gear-sets` while unauthenticated redirects to `/auth/signin`
- AppNav shows "Gear Sets" as an active link (not grayed out)
- "Gear Sets" link activates (highlights) when on `/gear-sets` or `/gear-sets/*`

**Implementation Note**: Pause for manual confirmation in Supabase dashboard and browser before proceeding to Phase 2.

---

## Phase 2: API Routes

### Overview

Implement three mutation endpoints for gear sets: create, update, delete. Create inserts a `gear_sets` row then composition rows. Update replaces compositions via delete-then-insert. All follow the defensive pattern from S-01: null-supabase check, `getUser()`, application-layer `.eq("user_id", user.id)`, redirect on error.

### Changes Required

#### 1. Create gear set

**File**: `src/pages/api/gear-sets/index.ts`

**Intent**: Accept a POST form submission to create a new gear set with its initial composition. Validates name and that at least one item is selected, inserts into both tables, redirects to the list.

**Contract**: `export const POST: APIRoute`. Null-supabase guard redirects to `/auth/signin?error=Supabase+is+not+configured`. Calls `getUser()`; missing auth redirects to `/auth/signin`. Reads `name` (trimmed string) and `itemIds = formData.getAll("item_ids") as string[]` from formData. Validates: name non-empty; `itemIds.length >= 1` — on failure redirect to `/gear-sets/add?error=<encoded>`. Inserts `{ user_id: user.id, name }` into `gear_sets`; reads back the new `id`. Inserts one `{ gear_set_id: newSetId, gear_item_id }` row per `itemId` into `gear_set_compositions`. On any Supabase error redirect to `/gear-sets/add?error=<encoded>`. On success redirect to `/gear-sets`.

#### 2. Update gear set

**File**: `src/pages/api/gear-sets/[id].ts`

**Intent**: Accept a POST form submission to update a gear set's name and replace its composition. Uses upsert-then-delete for composition replacement: new/kept items are inserted first, then stale items are removed. This ordering ensures a Supabase failure never leaves the set empty — worst case is extra stale items or missing new ones, both recoverable.

**Contract**: `export const POST: APIRoute`. Same null-supabase and auth guards as create. Reads `id` from `context.params`. Reads `name` and `itemIds` from formData. Same validations. Updates `gear_sets` with `{ name, updated_at: new Date().toISOString() }` plus `.eq("id", id).eq("user_id", user.id)` — application-layer ownership check. Then two composition calls in sequence:

1. **Upsert** new/kept compositions: `.from("gear_set_compositions").upsert(itemIds.map(itemId => ({ gear_set_id: id, gear_item_id: itemId })), { onConflict: "gear_set_id,gear_item_id", ignoreDuplicates: true })` — adds new rows, no-ops for already-present ones.
2. **Delete** stale compositions: `.from("gear_set_compositions").delete().eq("gear_set_id", id).not("gear_item_id", "in", `(${itemIds.join(",")})`)` — removes any composition rows no longer in the submitted list.

On any error redirect to `/gear-sets/${id}/edit?error=<encoded>`. On success redirect to `/gear-sets`.

#### 3. Delete gear set

**File**: `src/pages/api/gear-sets/[id]/delete.ts`

**Intent**: Hard-delete a gear set. `ON DELETE CASCADE` on `gear_set_compositions` removes composition rows automatically.

**Contract**: `export const POST: APIRoute`. Same guards. Reads `id` from `context.params`. Calls `.delete().eq("id", id).eq("user_id", user.id)`. On error redirect to `/gear-sets?error=<encoded>`. On success redirect to `/gear-sets`.

### Success Criteria

#### Automated Verification

- TypeScript check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification

- Error redirect flows surface the error message on the originating form page (test by submitting with empty name)

**Implementation Note**: Phase 2 success criteria can be verified together with Phase 3 manual testing. Pause for manual confirmation before marking this phase complete.

---

## Phase 3: UI Pages

### Overview

Build the four UI pieces: the `GearSetForm` React component (checkboxes for composition), the list page, the create page, and the edit page. Completes the S-02 outcome.

### Changes Required

#### 1. GearSet form component

**File**: `src/components/gear/GearSetForm.tsx`

**Intent**: Reusable React component for both create and edit. Client-side validation before native form POST: name required, at least one item checked. The checkbox list renders all of the user's available gear items so they can be included in the set.

**Contract**: Props: `action: string`, `availableItems: GearItem[]`, `initialValues?: { name?: string }`, `selectedItemIds?: string[]`, `serverError?: string | null`. Renders: name text input (required); scrollable list of checkboxes — one per `availableItem`, each with `name="item_ids"` and `value={item.id}`, `defaultChecked` if `selectedItemIds` includes the item's id; each label shows `item.name (item.category)`; submit button. `useState` for `name` field value and a `touched` flag for showing validation errors. On submit: validates name non-empty and at least one checkbox is checked (`document.querySelectorAll('input[name="item_ids"]:checked').length > 0` or track via controlled state); calls `e.preventDefault()` if invalid. Renders via `<form method="POST" action={action}>`. Follows the same structure as `GearItemForm.tsx` (uses `FormField`, `SubmitButton`, `ServerError` components).

Note: checkboxes are uncontrolled (`defaultChecked`) to let the browser handle form serialization; validation reads the checked state imperatively on submit via a ref or a controlled Set state.

#### 2. Gear sets list page

**File**: `src/pages/gear-sets/index.astro`

**Intent**: Server-rendered list of the authenticated user's gear sets, each showing name and comma-joined gear item names. Friendly empty state with "Create gear set" CTA when none exist.

**Contract**: Frontmatter queries `gear_sets` with a nested select: `.select('*, gear_set_compositions(gear_items(id, name, category))')`. Also applies `.eq("user_id", user.id).order("created_at", { ascending: false })`. Follows the defensive pattern: `const error = result?.error?.message ?? Astro.url.searchParams.get("error")`. For each set, derive item names via `set.gear_set_compositions.map(c => c.gear_items?.name).filter(Boolean).join(', ')` — show "No items" if empty (possible after cascade delete). Uses `AppLayout`. Empty state (no sets): short message + `<a href="/gear-sets/add">` styled as a button. Set row: name, comma-separated item names; `<a href={`/gear-sets/${set.id}/edit`}>Edit</a>`; delete form with `onclick="return confirm('Delete this gear set?')"` per established pattern.

#### 3. Create gear set page

**File**: `src/pages/gear-sets/add.astro`

**Intent**: Page wrapping `GearSetForm` for creating a new set. If the user has no gear items, shows an inline empty state with a link to `/gear/add` instead of rendering the form.

**Contract**: Frontmatter queries all `gear_items` for the user: `.select('*').eq("user_id", user.id).order("name")`. Reads `error` from `Astro.url.searchParams`. If `gearItems.length === 0`: renders an empty state message ("You have no gear items yet. Add one before creating a set.") with an `<a href="/gear/add">` link. If items exist: renders `GearSetForm` with `action="/api/gear-sets"`, `availableItems={gearItems}`, and `serverError`. Uses `AppLayout`. Includes a back link to `/gear-sets`.

#### 4. Edit gear set page

**File**: `src/pages/gear-sets/[id]/edit.astro`

**Intent**: Page wrapping `GearSetForm` pre-filled with the existing set's name and composition. Loads the gear set with its current items and all available gear items.

**Contract**: Reads `id` from `Astro.params`. Two parallel queries: (a) `gear_sets` where `id` and `user_id = user.id` with `.select('*, gear_set_compositions(gear_item_id)').maybeSingle()` — if null, redirect to `/gear-sets?error=Set+not+found`; (b) all `gear_items` for the user. Extracts `selectedItemIds = gearSet.gear_set_compositions.map(c => c.gear_item_id)`. Reads `error` from `Astro.url.searchParams`. Consolidates DB errors: `const error = setResult?.error?.message ?? itemsResult?.error?.message ?? Astro.url.searchParams.get("error")`. Renders `GearSetForm` with `action={`/api/gear-sets/${id}`}`, `availableItems`, `initialValues={{ name: gearSet.name }}`, `selectedItemIds`, and `serverError`. Uses `AppLayout`. Includes a back link to `/gear-sets`.

### Success Criteria

#### Automated Verification

- TypeScript check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- `/gear-sets` renders with AppNav showing "Gear Sets" active and friendly empty state for a new user
- Clicking "Create gear set" opens `/gear-sets/add` with the name field and gear items as checkboxes
- Submitting the create form with a name and at least one item checked creates the set; list page shows name and item names
- Submitting without a name or without any checked items shows client-side validation error (no POST fires)
- "Edit" opens `/gear-sets/[id]/edit` with name pre-filled and correct items pre-checked; saving returns to list with updated data
- "Delete" triggers browser confirm; confirming removes set and its compositions; cancelling leaves it intact
- Navigating directly to `/gear-sets/[other-user-set-id]/edit` as a different user redirects to `/gear-sets?error=Set+not+found` (RLS enforced)
- Navigating to `/gear-sets/add` when the user has no gear items shows the empty state with a link to `/gear/add`, not a broken form
- Deleting a gear item from `/gear/[id]/edit` that is the only item in a gear set causes the set to show "No items" on the list page (cascade behavior verified)

**Implementation Note**: This is the full end-to-end verification for S-02. Only after all manual checks pass is this change complete.

---

## Testing Strategy

### Unit Tests

No test framework configured — skip.

### Integration Tests

None at this stage.

### Manual Testing Steps

1. Register or log in. Navigate to `/gear-sets` via AppNav — confirm empty state renders and "Gear Sets" is the active nav item.
2. Navigate to `/gear-sets/add` without having any gear items — confirm empty state with "Add one" CTA, no form rendered.
3. Add a gear item via `/gear/add`. Return to `/gear-sets/add` — confirm checkboxes appear.
4. Submit create form with a name and one checked item. Confirm set appears in list with item name.
5. Submit create form with no name — confirm client-side validation fires, no POST.
6. Submit create form with name but no items checked — confirm client-side validation fires, no POST.
7. Click "Edit" on the set. Confirm name is pre-filled, original item is checked. Change name, check another item, uncheck original. Save. Confirm list reflects changes.
8. Click "Delete" on the set. Cancel — set still present. Confirm — set removed from list.
9. Create a gear set with one item. Go to `/gear` and delete that item (the one in the set). Navigate back to `/gear-sets` — confirm the set now shows "No items" (cascade behavior).
10. Open private/incognito window as a second user. Copy the first user's gear set edit URL and navigate — confirm redirect with "Set not found".
11. Navigate to `/gear-sets` while unauthenticated — confirm redirect to `/auth/signin`.

## Performance Considerations

The list page uses Supabase's nested select (`gear_set_compositions(gear_items(...))`). At MVP scale (dozens of sets, dozens of items) this is a single PostgREST request with acceptable latency. No caching or pagination needed.

## Migration Notes

Third migration in the project (after `0000_gear_items` and `0001_gear_items_updated_at_trigger`). Uses timestamp `20260605000002`. The `set_updated_at()` function and `moddatetime` extension were already deployed in migration 0001 — the new migration calls `CREATE TRIGGER ... EXECUTE PROCEDURE public.set_updated_at()` without re-creating the function.

Apply via `npx supabase db push` (requires `supabase login` and project linked to `welwzvjoqvutnuhqnckw`), or paste directly into the Supabase dashboard SQL editor.

**S-03 handoff note**: The `fights` table will reference `gear_sets.id` with a nullable FK. That FK should use `ON DELETE SET NULL` so deleting a gear set doesn't cascade-delete fight records. This constraint will be defined in S-03's migration, not here.

## References

- Roadmap slice: `context/foundation/roadmap.md` — S-02
- PRD requirements: `context/foundation/prd.md` — FR-008 through FR-011
- Prior change plan: `context/changes/gear-item-crud/plan.md` — establishes the SSR CRUD pattern this change reuses
- Impl-review findings: `context/changes/gear-item-crud/reviews/impl-review.md` — F1, F2, F3 document the defensive patterns baked into Phase 2 and 3 contracts
- Supabase client factory: `src/lib/supabase.ts`
- Form component pattern: `src/components/gear/GearItemForm.tsx`
- AppNav stub: `src/components/AppNav.astro`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database Schema, Types, and Navigation

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db push`
- [x] 1.2 TypeScript check passes: `npx astro check`
- [x] 1.3 Lint passes: `npm run lint`

#### Manual

- [x] 1.4 gear_sets and gear_set_compositions tables visible in Supabase dashboard
- [x] 1.5 RLS enabled on both tables with correct policies listed
- [x] 1.6 gear_set_compositions has unique constraint and cascade FKs confirmed
- [x] 1.7 /gear-sets redirects to sign-in when unauthenticated
- [x] 1.8 AppNav shows Gear Sets as active link (not grayed out)
- [x] 1.9 Gear Sets link highlights when on /gear-sets or /gear-sets/*

### Phase 2: API Routes

#### Automated

- [ ] 2.1 TypeScript check passes: `npx astro check`
- [ ] 2.2 Lint passes: `npm run lint`

#### Manual

- [ ] 2.3 Error redirect flows surface error messages on form pages

### Phase 3: UI Pages

#### Automated

- [ ] 3.1 TypeScript check passes: `npx astro check`
- [ ] 3.2 Lint passes: `npm run lint`
- [ ] 3.3 Build succeeds: `npm run build`

#### Manual

- [ ] 3.4 /gear-sets empty state renders correctly for new user
- [ ] 3.5 Create form shows checkboxes and creates a set with item names visible in list
- [ ] 3.6 Client-side validation blocks submit with empty name or no items checked
- [ ] 3.7 Edit form pre-fills name and pre-checks correct items; saving updates the list
- [ ] 3.8 Delete with confirm removes set; cancel does not
- [ ] 3.9 Second user cannot access first user's set edit page (RLS enforced)
- [ ] 3.10 /gear-sets/add with no gear items shows empty state CTA instead of form
- [ ] 3.11 Deleting a gear item cascades: set shows No items on list page
- [ ] 3.12 /gear-sets redirects to sign-in when unauthenticated
