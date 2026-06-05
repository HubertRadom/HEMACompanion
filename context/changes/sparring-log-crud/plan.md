# Sparring Log CRUD Implementation Plan

## Overview

Implement sparring log CRUD (log / list / edit / delete) at `/fights` as the third HEMA domain slice. Deploys the `fights` table (completing the F-01 schema). Activates the "Fights" stub in AppNav. Follows the SSR + POST → redirect + React island pattern established in S-01 and S-02.

## Current State Analysis

- `gear_sets` and `gear_set_compositions` tables are deployed with RLS. `gear_items` table and its patterns are in place from S-01. `AppNav` has "Fights" as a `<span class="cursor-default text-white/25">` stub — identical to how "Gear Sets" looked before S-02.
- No `fights` table exists yet.
- `src/lib/types.ts` defines `GearItem`, `GearSet`, `GearSetComposition` — no fight types yet.
- `src/middleware.ts` protects `["/dashboard", "/gear", "/gear-sets"]` — `/fights` is not yet guarded.
- The `set_updated_at()` trigger function is deployed (migration 0001) and reused by this migration.
- Defensive patterns from S-01 impl-review (carried into S-02) apply here: explicit `.eq("user_id", user.id)` on all page-level queries, application-layer ownership check in all mutation routes, DB error surfacing via a consolidated `error` variable.

### Key Discoveries

- `src/components/AppNav.astro` — "Fights" is a `<span class="cursor-default text-white/25">` stub; becomes `<a href="/fights">` with the same active-state conditional class logic as the Gear and Gear Sets links.
- `src/middleware.ts` — `PROTECTED_ROUTES` array; append `"/fights"`.
- `gear_sets.id` is the nullable FK target; the S-02 plan explicitly noted this FK must use `ON DELETE SET NULL` (not cascade) so deleting a gear set never removes fight records.
- Migration numbering: next is `20260605000003_fights.sql` (after `20260605000002_gear_sets.sql`).
- Weapon categories (decided): `longsword`, `sabre`, `rapier`, `other`. App-layer validation only (same as `GEAR_CATEGORIES` in S-01) — no DB CHECK constraint. A `WEAPON_CATEGORIES` constant lives in the API route files.
- Result values: `win`, `loss`, `draw`. Same app-layer-only validation approach.
- The fights table has no join table — simpler than S-02; composition replacement logic is not needed.

## Desired End State

- Authenticated users can navigate to `/fights` via AppNav (previously stubbed link now live).
- `/fights` lists the user's fights ordered by date descending, each row showing: date, opponent name, result (colored), weapon category, and edit/delete actions. Friendly empty state when none exist.
- Users can log a new fight at `/fights/add` with: opponent name (free text), weapon category (select), result (win/loss/draw select), date (date picker, defaults to today), and optional gear set (dropdown with "No gear set" as default; disabled with hint if the user has no gear sets yet).
- Users can edit a logged fight at `/fights/[id]/edit` with all fields pre-filled.
- Users can delete a fight from the list with a browser confirm dialog.
- All operations are RLS-enforced at both the DB and application layers.
- Deleting a gear set does not remove associated fight records — the `gear_set_id` FK becomes `NULL` via `ON DELETE SET NULL`.

## What We're NOT Doing

- Notes or comments field on fights — PRD FR-012 does not include it.
- Pagination on the fight list — per-user volume is small at MVP scale (~hundreds of fights).
- Undo / soft-delete — hard delete is correct per PRD FR-015.
- Fight detail page — the edit page serves as the detail view.
- Multiple opponents per fight — PRD specifies a single opponent name per fight.
- Custom / user-defined weapon categories — the four categories (longsword, sabre, rapier, other) are fixed for MVP.
- Supabase type generation — still deferred to S-04 when all tables exist.

## Implementation Approach

Same SSR-first approach as S-01 and S-02: Astro pages fetch data server-side, mutations go through POST API routes, React island handles client-side validation only. The `fights` table has a single optional FK to `gear_sets` — no join table, so the API routes are simpler than S-02. The `FightForm` component is the most complex form so far (five fields including two selects and a date input) but follows the same `FormField` / `SubmitButton` / `ServerError` pattern.

---

## Phase 1: Database Schema, Types, and Navigation

### Overview

Deploy the `fights` table with RLS and the `updated_at` trigger. Add the `Fight` type. Activate the Fights nav link and add `/fights` to middleware protection.

### Changes Required

#### 1. Migration file

**File**: `supabase/migrations/20260605000003_fights.sql`

**Intent**: Define the `fights` table, enable RLS on it, and attach the existing `set_updated_at()` trigger. This completes the F-01 schema (all tables for MVP are now deployed).

**Contract**:

`fights` columns: `id` (uuid pk, `gen_random_uuid()`), `user_id` (uuid not null, references `auth.users(id)` on delete cascade), `opponent_name` (text not null), `weapon_category` (text not null), `result` (text not null), `date` (date not null), `gear_set_id` (uuid nullable, references `public.gear_sets(id)` on delete set null), `created_at` (timestamptz not null, default `now()`), `updated_at` (timestamptz not null, default `now()`).

Four RLS policies identical to `gear_items` and `gear_sets` (SELECT / INSERT / UPDATE / DELETE using `auth.uid() = user_id`; UPDATE uses both USING and WITH CHECK). Trigger: `CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.fights FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at()`.

Apply via `npx supabase db push` or paste SQL into Supabase dashboard SQL editor.

#### 2. Type definition

**File**: `src/lib/types.ts`

**Intent**: Add the `Fight` interface for use by page frontmatters and the form component.

**Contract**: Append one interface. `Fight`: `id: string`, `user_id: string`, `opponent_name: string`, `weapon_category: string`, `result: string`, `date: string`, `gear_set_id: string | null`, `created_at: string`, `updated_at: string`.

#### 3. Middleware route protection

**File**: `src/middleware.ts`

**Intent**: Add `/fights` to the protected routes list so the existing auth guard covers the new section.

**Contract**: Append `"/fights"` to the `PROTECTED_ROUTES` array.

#### 4. AppNav — activate Fights link

**File**: `src/components/AppNav.astro`

**Intent**: Replace the disabled "Fights" `<span>` stub with a live `<a href="/fights">` that follows the same active-state logic as the Gear and Gear Sets links.

**Contract**: Add `const isFights = pathname.startsWith('/fights')` alongside the existing `isGear` and `isGearSets` variables. Replace the `<span class="cursor-default text-white/25">Fights</span>` element with `<a href="/fights">` using the same conditional class pattern. The active check must not conflict with `isGear` or `isGearSets` (no `/fights` prefix overlap exists).

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npx supabase db push` exits with no errors
- TypeScript check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification

- `fights` table visible in Supabase dashboard → Table Editor with correct columns and types
- RLS enabled on `fights`; four correct policies listed
- `gear_set_id` column is nullable; FK references `gear_sets.id` with `ON DELETE SET NULL` (not cascade)
- `updated_at` trigger visible on the `fights` table
- Navigating to `/fights` while unauthenticated redirects to `/auth/signin`
- AppNav shows "Fights" as an active link (not grayed out)
- "Fights" link highlights when on `/fights` or `/fights/*`

**Implementation Note**: Pause for manual confirmation in Supabase dashboard and browser before proceeding to Phase 2.

---

## Phase 2: API Routes

### Overview

Implement three mutation endpoints for fights: create, update, delete. All follow the defensive pattern from S-01/S-02: null-supabase check, `getUser()`, application-layer `.eq("user_id", user.id)`, redirect on error.

### Changes Required

#### 1. Create fight

**File**: `src/pages/api/fights/index.ts`

**Intent**: Accept a POST form submission to log a new fight. Validates all required fields and inserts a single row into `fights`.

**Contract**: `export const POST: APIRoute`. Null-supabase guard redirects to `/auth/signin?error=Supabase+is+not+configured`. Calls `getUser()`; missing auth redirects to `/auth/signin`. Reads from formData: `opponent_name` (trimmed string), `weapon_category` (string), `result` (string), `date` (string), `gear_set_id` (string | null — treat empty string as `null`).

Define `const WEAPON_CATEGORIES = ['longsword', 'sabre', 'rapier', 'other'] as const` and `const FIGHT_RESULTS = ['win', 'loss', 'draw'] as const` at module scope.

Validates: `opponent_name` non-empty; `weapon_category` in `WEAPON_CATEGORIES`; `result` in `FIGHT_RESULTS`; `date` non-empty. On any validation failure redirect to `/fights/add?error=<encoded>`. Inserts `{ user_id: user.id, opponent_name, weapon_category, result, date, gear_set_id: gearSetId || null }` into `fights`. On Supabase error redirect to `/fights/add?error=<encoded>`. On success redirect to `/fights`.

#### 2. Update fight

**File**: `src/pages/api/fights/[id].ts`

**Intent**: Accept a POST form submission to update all fields of an existing fight. Applies the application-layer ownership check via `.eq("user_id", user.id)`.

**Contract**: `export const POST: APIRoute`. Same null-supabase and auth guards. Reads `id` from `context.params`. Reads same fields as create. Same `WEAPON_CATEGORIES` and `FIGHT_RESULTS` constants (copy or import). Same validations. Updates `fights` with `{ opponent_name, weapon_category, result, date, gear_set_id: gearSetId || null, updated_at: new Date().toISOString() }` plus `.eq("id", id).eq("user_id", user.id)`. On error redirect to `/fights/${id}/edit?error=<encoded>`. On success redirect to `/fights`.

#### 3. Delete fight

**File**: `src/pages/api/fights/[id]/delete.ts`

**Intent**: Hard-delete a fight record. No cascade side effects (no child tables reference `fights`).

**Contract**: `export const POST: APIRoute`. Same guards. Reads `id` from `context.params`. Calls `.delete().eq("id", id).eq("user_id", user.id)`. On error redirect to `/fights?error=<encoded>`. On success redirect to `/fights`.

### Success Criteria

#### Automated Verification

- TypeScript check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification

- Error redirect flows surface the error message on the originating form page (test by submitting with empty opponent name)

**Implementation Note**: Phase 2 can be verified together with Phase 3 manual testing. Pause for manual confirmation before marking this phase complete.

---

## Phase 3: UI Pages

### Overview

Build the `FightForm` React component (five fields: opponent name, weapon category, result, date, optional gear set) and the three pages: list, add, and edit. Completes the S-03 outcome.

### Changes Required

#### 1. FightForm component

**File**: `src/components/fights/FightForm.tsx`

**Intent**: Reusable React component for both log and edit. Client-side validation before native form POST: opponent name required, weapon category required, result required, date required. Gear set is optional.

**Contract**: Props: `action: string`, `gearSets: GearSet[]`, `initialValues?: { opponent_name?: string; weapon_category?: string; result?: string; date?: string; gear_set_id?: string | null }`, `serverError?: string | null`.

Fields:
- `opponent_name`: text input, required, placeholder "e.g. Jan Kowalski"
- `weapon_category`: `<select name="weapon_category">` with options `longsword | sabre | rapier | other` (display capitalized)
- `result`: `<select name="result">` with options `win | loss | draw` (display capitalized)
- `date`: `<input type="date" name="date">`, default value set to today's ISO date string (`new Date().toISOString().slice(0, 10)`) when no `initialValues.date` is provided
- `gear_set_id`: `<select name="gear_set_id">`. First option: `<option value="">No gear set</option>`. If `gearSets.length === 0`: render a disabled select with placeholder "No gear sets — create one" and a small `<a href="/gear-sets/add">` link below it. Otherwise: render the full list of user's gear sets as `<option value={set.id}>{set.name}</option>`.

Client-side validation on submit: checks opponent_name non-empty, weapon_category and result selected (both have required defaults so this is a safety check), date non-empty. Uses `useState` for error state; clears field error on change. Follows same structure as `GearSetForm.tsx` (uses `FormField`, `SubmitButton`, `ServerError` components). Renders via `<form method="POST" action={action}>`.

#### 2. Fight list page

**File**: `src/pages/fights/index.astro`

**Intent**: Server-rendered list of the authenticated user's fights, ordered by date descending. Each row shows date, opponent name, result (with colored badge), weapon category, and edit/delete actions. Friendly empty state with "Log your first fight" CTA.

**Contract**: Frontmatter queries `fights` with `.select('*').eq("user_id", user.id).order("date", { ascending: false }).order("created_at", { ascending: false })`. Defensive error handling: `const error = result?.error?.message ?? Astro.url.searchParams.get("error")`. Empty state (no fights): short message + `<a href="/fights/add">` styled as a button. Fight row: date (formatted as locale date string), opponent_name, result badge (green for win, red for loss, yellow for draw), weapon_category, `<a href={`/fights/${fight.id}/edit`}>Edit</a>`, and a delete form posting to `/api/fights/${fight.id}/delete` with `onclick="return confirm('Delete this fight?')"`. Uses `AppLayout`.

#### 3. Log fight page (add)

**File**: `src/pages/fights/add.astro`

**Intent**: Page wrapping `FightForm` for logging a new fight. Always renders the form (unlike the gear set add page, there is no prerequisite dependency blocking fight creation — gear set is optional).

**Contract**: Frontmatter loads the user's gear sets: `.select('id, name').eq("user_id", user.id).order("name")`. Reads `error` from `Astro.url.searchParams`. Renders `FightForm` with `action="/api/fights"`, `gearSets={gearSets}`, and `serverError`. Uses `AppLayout`. Includes a back link to `/fights`.

#### 4. Edit fight page

**File**: `src/pages/fights/[id]/edit.astro`

**Intent**: Page wrapping `FightForm` pre-filled with all fields of the existing fight. Redirects to the list if the fight is not found or not owned by the user.

**Contract**: Reads `id` from `Astro.params`. Two parallel queries: (a) `fights` where `id` and `user_id = user.id` with `.maybeSingle()` — if null, redirect to `/fights?error=Fight+not+found`; (b) `gear_sets` for the user. Consolidates errors: `const error = fightResult?.error?.message ?? setsResult?.error?.message ?? Astro.url.searchParams.get("error")`. Renders `FightForm` with `action={`/api/fights/${id}`}`, `gearSets`, `initialValues` (all fight fields mapped to form field names), and `serverError`. Uses `AppLayout`. Includes a back link to `/fights`.

### Success Criteria

#### Automated Verification

- TypeScript check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- `/fights` renders with AppNav showing "Fights" active and a friendly empty state for a new user
- Clicking "Log your first fight" opens `/fights/add` with all five fields visible and date pre-filled to today
- Submitting the add form with valid data creates the fight; list page shows the fight row with correct result badge color
- Submitting with empty opponent name shows client-side validation error (no POST fires)
- Submitting with no date shows client-side validation error
- "Edit" opens `/fights/[id]/edit` with all fields pre-filled correctly; saving returns to list with updated data
- "Delete" triggers browser confirm; confirming removes the fight; cancelling leaves it intact
- Logging a fight with a gear set: gear set name is stored correctly; editing and changing the gear set to "No gear set" sets `gear_set_id` to `null` (no FK error)
- Deleting a gear set that is referenced by a fight: fight record remains in the list with `gear_set_id = null` (ON DELETE SET NULL verified)
- Navigating directly to `/fights/[other-user-fight-id]/edit` as a different user redirects to `/fights?error=Fight+not+found`
- Navigating to `/fights/add` when the user has no gear sets: gear set field shows disabled placeholder with link to `/gear-sets/add`; form can still be submitted
- Navigating to `/fights` while unauthenticated redirects to `/auth/signin`

**Implementation Note**: This is the full end-to-end verification for S-03. Only after all manual checks pass is this change complete.

---

## Testing Strategy

### Unit Tests

No test framework configured — skip.

### Integration Tests

None at this stage.

### Manual Testing Steps

1. Register or log in. Navigate to `/fights` via AppNav — confirm empty state renders and "Fights" is the active nav item.
2. Log a fight without selecting a gear set. Confirm it appears in the list with a result badge.
3. Log a fight with a gear set selected. Confirm it appears correctly.
4. Submit the log form with empty opponent name — confirm client-side validation fires, no POST.
5. Submit the log form with no date — confirm client-side validation fires, no POST.
6. Click "Edit" on a fight. Confirm all fields pre-fill. Change the result and date. Save. Confirm list reflects changes.
7. Edit a fight and change gear set to "No gear set". Save. Confirm `gear_set_id` becomes null (no error, fight still in list).
8. Click "Delete" on a fight. Cancel — fight still present. Confirm — fight removed.
9. Log a fight with a gear set. Go to `/gear-sets` and delete that gear set. Return to `/fights` — confirm the fight row still appears (gear_set_id became null; no data loss).
10. Open private/incognito window as a second user. Copy the first user's fight edit URL and navigate — confirm redirect with "Fight not found".
11. Navigate to `/fights/add` with no gear sets yet — confirm gear set field is disabled with "create one" hint; confirm form submits successfully without a gear set.
12. Navigate to `/fights` while unauthenticated — confirm redirect to `/auth/signin`.

## Performance Considerations

The list page is a simple `.select('*')` on `fights` — no nested joins. At MVP scale (hundreds of fights per user) this is well within PostgREST latency limits with the RLS-indexed `user_id` column.

## Migration Notes

Fourth migration in the project (after `0000_gear_items`, `0001_gear_items_updated_at_trigger`, `0002_gear_sets`). Uses timestamp `20260605000003`. The `set_updated_at()` function and `moddatetime` extension were deployed in migration 0001 — no re-creation needed.

Apply via `npx supabase db push` or paste directly into the Supabase dashboard SQL editor.

**F-01 completion note**: This migration deploys the last remaining table from the original F-01 foundation. After this lands, F-01 can be marked fully complete in the roadmap.

## References

- Roadmap slice: `context/foundation/roadmap.md` — S-03
- PRD requirements: `context/foundation/prd.md` — FR-012 through FR-015, US-01
- S-02 handoff note: `context/changes/gear-set-crud/plan.md` — "Migration Notes" (ON DELETE SET NULL specification)
- Prior change plan (pattern source): `context/changes/gear-set-crud/plan.md`
- Supabase client factory: `src/lib/supabase.ts`
- Form component pattern: `src/components/gear/GearSetForm.tsx`
- AppNav stub: `src/components/AppNav.astro`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database Schema, Types, and Navigation

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db push` exits with no errors — 877a764
- [x] 1.2 TypeScript check passes: `npx astro check` — 877a764
- [x] 1.3 Lint passes: `npm run lint` — 877a764

#### Manual

- [x] 1.4 fights table visible in Supabase dashboard with correct columns and types — 877a764
- [x] 1.5 RLS enabled on fights with four correct policies listed — 877a764
- [x] 1.6 gear_set_id is nullable with ON DELETE SET NULL FK (not cascade) — 877a764
- [x] 1.7 updated_at trigger visible on the fights table — 877a764
- [x] 1.8 /fights redirects to sign-in when unauthenticated — 877a764
- [x] 1.9 AppNav shows Fights as an active link (not grayed out) — 877a764
- [x] 1.10 Fights link highlights when on /fights or /fights/* — 877a764

### Phase 2: API Routes

#### Automated

- [x] 2.1 TypeScript check passes: `npx astro check`
- [x] 2.2 Lint passes: `npm run lint`

#### Manual

- [x] 2.3 Error redirect flows surface error messages on form pages

### Phase 3: UI Pages

#### Automated

- [x] 3.1 TypeScript check passes: `npx astro check`
- [x] 3.2 Lint passes: `npm run lint`
- [x] 3.3 Build succeeds: `npm run build`

#### Manual

- [x] 3.4 /fights empty state renders correctly with "Log your first fight" CTA
- [x] 3.5 Log form shows all five fields with date pre-filled to today
- [x] 3.6 Logging a fight creates it in the list with correct result badge color
- [x] 3.7 Client-side validation blocks submit with empty opponent name or date
- [x] 3.8 Edit form pre-fills all fields correctly; saving updates the list
- [x] 3.9 Changing gear set to "No gear set" on edit sets gear_set_id to null (no error)
- [x] 3.10 Delete with confirm removes fight; cancel does not
- [x] 3.11 Deleting a referenced gear set leaves fight in list with gear_set_id null
- [x] 3.12 Second user cannot access first user's fight edit page (redirects with Fight not found)
- [x] 3.13 Add form with no gear sets shows disabled gear set field with link to /gear-sets/add; form still submits
- [x] 3.14 /fights redirects to sign-in when unauthenticated
