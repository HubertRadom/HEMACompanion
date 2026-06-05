# Gear Item CRUD Implementation Plan

## Overview

Implement gear item CRUD (add / list / edit / delete) at `/gear` as the first HEMA domain slice. Also establishes the authenticated app navigation shell (`AppLayout` + `AppNav`) and the SSR CRUD pattern (POST → redirect) that S-02 and S-03 will reuse. F-01's schema work is scoped to just the `gear_items` table + its RLS policies.

## Current State Analysis

- No domain tables exist; `supabase/migrations/` directory is absent.
- Auth stack is fully functional: Supabase client at `src/lib/supabase.ts`, route protection middleware at `src/middleware.ts` (guards `/dashboard` only), API routes under `src/pages/api/auth/`.
- `Layout.astro` is a bare shell (html/head/body + slot) with no persistent nav or app chrome.
- React form pattern established in `src/components/auth/`: React island for client-side validation wrapping a native `<form method="POST">` submission to an API route, redirect on success.
- `supabase` CLI v2.23.4 is installed as a dev dependency — migration tooling is in place.

### Key Discoveries

- `src/lib/supabase.ts:1–24` — `createClient(requestHeaders, cookies)` is the server-side client factory used in all API routes and Astro pages.
- `src/middleware.ts:4` — `PROTECTED_ROUTES` is a string array; appending `"/gear"` enables auth gating for the new section.
- `src/pages/api/auth/signin.ts` — canonical API route pattern: `export const POST: APIRoute`, read formData, call Supabase, redirect.
- `src/components/auth/SignInForm.tsx` — canonical React form pattern: client-side validation via `useState`, native `<form method="POST" action="...">` submission.
- `@astrojs/check` installed — TypeScript checking runs via `npx astro check`.

## Desired End State

- Authenticated users navigate to `/gear` from any authenticated page via a persistent nav bar.
- `/gear` lists the user's gear items (name, category, optional brand/model) with a friendly empty state when none exist.
- Users can add an item via `/gear/add`, edit via `/gear/[id]/edit`, and delete from the list with a browser confirmation step.
- All operations are RLS-enforced — no user can read or modify another user's gear items.
- The navigation shell (`AppLayout`) with stubbed links for Gear Sets, Fights, and Stats is in place for S-02 and S-03 to build on.

## What We're NOT Doing

- Full F-01 schema: `gear_sets`, `gear_set_compositions`, `fights` tables land in S-02 and S-03.
- Supabase type generation (`supabase gen types typescript`) — a manual `GearItem` interface is defined; type gen can be wired after all tables exist in S-04.
- Client-side state management or optimistic UI — all mutations go through POST → redirect.
- Undo / soft-delete — hard delete is correct per PRD FR-007.
- Pagination on the gear list — item count per user is small at MVP scale.

## Implementation Approach

SSR-first: Astro pages query Supabase in their frontmatter and render server-side HTML. Mutations go through dedicated API routes that read `formData`, call Supabase, and redirect. React islands (like auth forms) are used only for client-side field validation — the actual submission is a native form POST. A new `AppLayout.astro` composes `Layout.astro` + `AppNav.astro` without modifying the existing layout.

---

## Phase 1: Database Schema

### Overview

Create the `gear_items` table and its RLS policies in a new Supabase migration file, then apply it to the remote project.

### Changes Required

#### 1. Migration file

**File**: `supabase/migrations/20260605000000_gear_items.sql`

**Intent**: Define the `gear_items` table and four RLS policies required for per-user data isolation. This is the first migration in the project; the `supabase/migrations/` directory must be created alongside it.

**Contract**: Table columns: `id` (uuid pk, default `gen_random_uuid()`), `user_id` (uuid not null, references `auth.users(id)` on delete cascade), `name` (text not null), `category` (text not null), `brand` (text nullable), `model` (text nullable), `created_at` / `updated_at` (timestamptz not null, default `now()`). RLS enabled; four policies using `auth.uid() = user_id` — SELECT / UPDATE / DELETE use `USING`, INSERT uses `WITH CHECK`.

Apply via `npx supabase db push` (requires Supabase CLI login and project linked to `welwzvjoqvutnuhqnckw`). Alternatively, run the SQL directly in the Supabase dashboard SQL editor.

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npx supabase db push` exits with no errors

#### Manual Verification

- `gear_items` table visible in Supabase dashboard → Table Editor
- Row Level Security toggled ON for the table
- Four policies listed (select, insert, update, delete)
- `user_id` column has FK constraint to `auth.users(id)`

**Implementation Note**: After automated verification passes, pause for manual confirmation in Supabase dashboard before proceeding to Phase 2.

---

## Phase 2: App Layout and Navigation

### Overview

Create the authenticated app shell (`AppLayout.astro`) with a persistent nav bar (`AppNav.astro`). Gate `/gear` in middleware. Update the dashboard to link to gear management.

### Changes Required

#### 1. Gear categories constant

**File**: `src/lib/gear-categories.ts`

**Intent**: Single source of truth for the predefined HEMA weapon category list, importable by both the form component (client-side bundle) and API routes (server-side validation). Ensures category values are consistent across form dropdowns and insert/update validation.

**Contract**: Export `GEAR_CATEGORIES` as a `readonly` const array. Values: `Longsword`, `Sabre`, `Rapier`, `Messer`, `Sidesword`, `Dagger`, `Sword & Buckler`, `Poleaxe`, `Other`. Export `GearCategory` as the union type inferred from the const.

#### 2. App navigation component

**File**: `src/components/AppNav.astro`

**Intent**: Server-rendered nav bar for all authenticated pages. Shows active state on the current section using `Astro.url.pathname`. Gear is a live link; Gear Sets, Fights, and Stats are stubbed (rendered as non-linked labels or visually muted spans). Sign-out is a `<form method="POST" action="/api/auth/signout">` button.

**Contract**: Accepts no props. Determines active section by checking if `Astro.url.pathname` starts with `/gear`. Stubbed items must not use `<a>` tags to avoid broken links. Sign-out requires no JavaScript — plain form POST.

#### 3. Authenticated app layout

**File**: `src/layouts/AppLayout.astro`

**Intent**: Layout wrapper for authenticated pages that composes `Layout.astro` with `AppNav.astro` and provides a `<main>` slot. Keeps `Layout.astro` unchanged so auth pages are unaffected.

**Contract**: Accepts `title?: string` prop, passes to `Layout`. Renders `AppNav` before `<slot />` inside Layout's body.

#### 4. Middleware route protection

**File**: `src/middleware.ts`

**Intent**: Add `/gear` to the protected routes list so the existing auth guard covers the new section.

**Contract**: Append `"/gear"` to the `PROTECTED_ROUTES` array at line 4. No other changes.

#### 5. Dashboard link to gear

**File**: `src/pages/dashboard.astro`

**Intent**: Add a link to `/gear` so users have a navigation path from the existing dashboard.

**Contract**: Add an `<a href="/gear">` element (button-styled) within the existing dashboard card.

### Success Criteria

#### Automated Verification

- TypeScript check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Navigating to `/gear` while unauthenticated redirects to `/auth/signin`
- Authenticated users see AppNav with Gear active, Gear Sets / Fights / Stats stubbed, and Sign out
- Active state highlights "Gear" when on `/gear` or `/gear/*` routes
- Dashboard shows a working link to `/gear`

**Implementation Note**: Pause for manual confirmation after this phase before proceeding to Phase 3.

---

## Phase 3: API Routes

### Overview

Implement the three mutation endpoints: create, update, delete. All follow the established auth API pattern: read formData, validate required fields, call Supabase (RLS enforces ownership), redirect.

### Changes Required

#### 1. Create gear item

**File**: `src/pages/api/gear/index.ts`

**Intent**: Accept a POST form submission, validate name and category, insert into `gear_items` with the authenticated user's ID, redirect to `/gear` on success or back to `/gear/add?error=...` on failure.

**Contract**: `export const POST: APIRoute`. Reads `name`, `category`, `brand`, `model` from `formData`. Validates: `name` is non-empty; `category` is a member of `GEAR_CATEGORIES`. Inserts `{ user_id: user.id, name, category, brand: brand || null, model: model || null }`. On Supabase error → redirect to `/gear/add?error=<encodeURIComponent(error.message)>`. On missing auth → redirect to `/auth/signin`. On success → redirect to `/gear`.

#### 2. Update gear item

**File**: `src/pages/api/gear/[id].ts`

**Intent**: Accept a POST form submission for updating an existing item. The RLS UPDATE policy (`user_id = auth.uid()`) means the update silently no-ops if `id` belongs to a different user — this is safe and correct.

**Contract**: `export const POST: APIRoute`. Reads `id` from `context.params`. Reads `name`, `category`, `brand`, `model` from `formData`. Validates same rules as create. Calls `.update({ name, category, brand: brand || null, model: model || null, updated_at: new Date().toISOString() }).eq("id", id)`. On error → redirect to `/gear/${id}/edit?error=<encoded>`. On success → redirect to `/gear`.

#### 3. Delete gear item

**File**: `src/pages/api/gear/[id]/delete.ts`

**Intent**: Accept a POST form submission to hard-delete a gear item. RLS DELETE policy ensures only the owner's rows are deleted.

**Contract**: `export const POST: APIRoute`. Reads `id` from `context.params`. Calls `.delete().eq("id", id)`. On error → redirect to `/gear?error=<encoded>`. On success → redirect to `/gear`.

### Success Criteria

#### Automated Verification

- TypeScript check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification

- Error redirect flows surface the error message on the originating form page (test by submitting an empty name)

**Implementation Note**: Phase 3 success criteria can be verified together with Phase 4 manual testing. Pause for manual confirmation before marking this phase complete.

---

## Phase 4: Gear UI Pages

### Overview

Build the four UI pieces: shared form component, list page, add page, and edit page. Together these complete the S-01 outcome.

### Changes Required

#### 1. GearItem type definition

**File**: `src/lib/types.ts`

**Intent**: Define the `GearItem` TypeScript interface matching the `gear_items` table schema. Used by page frontmatters and the form component.

**Contract**: Interface fields: `id: string`, `user_id: string`, `name: string`, `category: string`, `brand: string | null`, `model: string | null`, `created_at: string`, `updated_at: string`.

#### 2. Shared gear item form component

**File**: `src/components/gear/GearItemForm.tsx`

**Intent**: Reusable React component for both add and edit. Provides client-side required-field validation before native form POST. Receives optional `initialValues` for edit mode.

**Contract**: Props: `action: string`, `initialValues?: Partial<GearItem>`, `serverError?: string | null`. Renders: name text input (required), category `<select>` populated from `GEAR_CATEGORIES` (required), brand text input (optional), model text input (optional), submit button. Uses `useState` for field values and validation errors. On submit: validates name non-empty and category selected; calls `e.preventDefault()` if invalid. Renders via `<form method="POST" action={action}>`. Follows the same structure as `src/components/auth/SignInForm.tsx` (uses `FormField`, `SubmitButton`, `ServerError` components).

#### 3. Gear list page

**File**: `src/pages/gear/index.astro`

**Intent**: Server-rendered list of the authenticated user's gear items ordered newest-first. Shows a friendly empty state with an "Add gear item" CTA when no items exist. Each row has an edit link and a delete form with a browser confirmation step.

**Contract**: Frontmatter queries `gear_items` ordered by `created_at desc`; reads `error` from `Astro.url.searchParams` for post-action error display. Uses `AppLayout`. Empty state: short message + `<a href="/gear/add">` styled as a button. Item row: name, category badge, optional brand/model text; `<a href={`/gear/${item.id}/edit`}>Edit</a>` link; `<form method="POST" action={`/api/gear/${item.id}/delete`}><button onclick="return confirm('Delete this gear item?')">Delete</button></form>`. The `confirm()` call requires no additional JavaScript — it's an inline `onclick` attribute.

#### 4. Add gear item page

**File**: `src/pages/gear/add.astro`

**Intent**: Page wrapping `GearItemForm` for creating a new item. Reads server error from query params and passes to the form.

**Contract**: Reads `error` from `Astro.url.searchParams`. Renders `GearItemForm` with `action="/api/gear"` and `serverError`. Uses `AppLayout`. Includes a back link to `/gear`.

#### 5. Edit gear item page

**File**: `src/pages/gear/[id]/edit.astro`

**Intent**: Page wrapping `GearItemForm` pre-filled with an existing item's values. If the item is not found (doesn't exist or RLS blocked it), redirects to `/gear` with an error.

**Contract**: Reads `id` from `Astro.params`. Queries `gear_items` where `id` equals the param — if result is empty, redirect to `/gear?error=Item+not+found`. Renders `GearItemForm` with `action={`/api/gear/${id}`}` and `initialValues={item}`. Reads `error` from `Astro.url.searchParams` for server-side error display. Uses `AppLayout`.

### Success Criteria

#### Automated Verification

- TypeScript check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- `/gear` renders with AppNav and empty state for a new user
- Clicking "Add gear item" opens `/gear/add` with populated category dropdown
- Submitting the add form creates an item visible in the list
- "Edit" link opens `/gear/[id]/edit` with fields pre-filled; saving returns to list with updated data
- "Delete" triggers browser confirm dialog; confirming removes item; cancelling leaves it intact
- Navigating directly to `/gear/[other-user-item-id]/edit` as a different user redirects to `/gear?error=Item+not+found` (RLS enforced)
- Sign out from AppNav redirects to sign-in

**Implementation Note**: This is the full end-to-end verification for S-01. Only after all manual checks pass is this change complete.

---

## Testing Strategy

### Unit Tests

No test framework configured — skip.

### Integration Tests

None at this stage.

### Manual Testing Steps

1. Register a new account (or use existing). Navigate to `/gear` — confirm empty state renders.
2. Click "Add gear item". Fill in name, select a category, optionally add brand/model. Submit.
3. Confirm item appears in the gear list with correct data.
4. Click "Edit" on the item. Modify name or category. Save. Confirm updated data shows in list.
5. Click "Delete". Click Cancel in confirm dialog — item still present. Click Delete again, click OK — item removed.
6. Open a private/incognito window, register a second account. Copy the first account's edit URL and navigate to it — confirm redirect with "not found" error.
7. Click Sign out from AppNav — confirm redirect to `/auth/signin`.

## Migration Notes

First database migration in the project. Create `supabase/migrations/` directory alongside the migration file. Apply with `npx supabase db push` (requires `supabase login` and project linked via `npx supabase link --project-ref welwzvjoqvutnuhqnckw`), or paste the SQL directly into the Supabase dashboard SQL editor.

## References

- Roadmap slice: `context/foundation/roadmap.md` — S-01
- PRD requirements: `context/foundation/prd.md` — FR-004 through FR-007
- Auth API route pattern: `src/pages/api/auth/signin.ts`
- Auth form pattern: `src/components/auth/SignInForm.tsx`
- Supabase client factory: `src/lib/supabase.ts`
- Middleware: `src/middleware.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database Schema

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db push` — a880139

#### Manual

- [x] 1.2 gear_items table visible in Supabase dashboard — a880139
- [x] 1.3 Row Level Security toggled ON with four policies listed — a880139
- [x] 1.4 user_id FK constraint to auth.users(id) confirmed — a880139

### Phase 2: App Layout and Navigation

#### Automated

- [x] 2.1 TypeScript check passes: `npx astro check` — 3443fd7
- [x] 2.2 Lint passes: `npm run lint` — 3443fd7
- [x] 2.3 Build succeeds: `npm run build` — 3443fd7

#### Manual

- [x] 2.4 /gear redirects to sign-in when unauthenticated — 3443fd7
- [x] 2.5 AppNav renders with Gear active and stubbed future links — da7ea07
- [x] 2.6 Dashboard shows working link to /gear — 3443fd7

### Phase 3: API Routes

#### Automated

- [x] 3.1 TypeScript check passes: `npx astro check` — e483cd4
- [x] 3.2 Lint passes: `npm run lint` — e483cd4

#### Manual

- [ ] 3.3 Error redirect flows surface error messages on form pages

### Phase 4: Gear UI Pages

#### Automated

- [x] 4.1 TypeScript check passes: `npx astro check` — da7ea07
- [x] 4.2 Lint passes: `npm run lint` — da7ea07
- [x] 4.3 Build succeeds: `npm run build` — da7ea07

#### Manual

- [x] 4.4 /gear empty state renders correctly for new user — da7ea07
- [x] 4.5 Add gear item creates item visible in list — da7ea07
- [x] 4.6 Edit gear item pre-fills form and saves correctly — da7ea07
- [x] 4.7 Delete with confirm removes item; cancel does not — da7ea07
- [x] 4.8 Second user cannot access first user's item edit page (RLS enforced) — da7ea07
- [x] 4.9 Sign out from AppNav redirects to sign-in — da7ea07
