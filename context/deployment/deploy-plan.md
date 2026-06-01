# Cloudflare Workers — Deploy Plan

**Project:** HEMA Companion  
**Platform:** Cloudflare Workers (via wrangler v4 + GitHub Actions auto-deploy)  
**Database:** Supabase (external, production project)  
**Based on:** `context/foundation/infrastructure.md` · `context/foundation/tech-stack.md`  
**Status legend:** `[ ]` todo · `[x]` done · `[!]` blocked / needs human action

---

## CURRENT STATE (2026-05-31) — DEPLOYMENT COMPLETE

| Item | Value |
|---|---|
| Production URL | `https://hema-companion.hub-rad1.workers.dev` |
| Platform | Cloudflare **Workers** (not Pages — see deviations) |
| Workers subdomain | `hemacompanion` → `hub-rad1.workers.dev` |
| Latest Worker version | `e96f0327` |
| Auto-deploy | GitHub Actions → push to `main` → `wrangler deploy` |
| Supabase project | `welwzvjoqvutnuhqnckw` |
| Runtime secrets | `SUPABASE_URL` + `SUPABASE_KEY` set on Worker |
| GitHub secrets | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`, `SUPABASE_KEY` |

**Remaining actions:**
- [!] Rotate all Cloudflare API tokens used in this session — they were exposed in conversation
- [ ] Lock preview URLs (Phase 6)
- [ ] Custom domain (post-MVP)

---

## Discovered deviations from the original plan

1. **Deployment is Cloudflare Workers, not Pages.** The `@astrojs/cloudflare` adapter v13 generates Workers-mode output (`dist/server/entry.mjs` + `dist/client/` assets). The original plan assumed Pages (`_worker.js`). Pages deployment produced 404 on all routes.

2. **`fetch_iterable_type_support` must NOT be set explicitly** — became the default 2026-02-19. Commit `0dbf9cd`.

3. **`--dry-run` flag removed** from `wrangler pages deploy` in wrangler 4.x.

4. **`wrangler pages project create` required** before first Pages deploy — newer wrangler doesn't auto-create. (Moot — we switched to Workers.)

5. **SESSION KV + IMAGES bindings** added unconditionally by `@astrojs/cloudflare` v13 adapter during build. They have no namespace IDs, so `wrangler deploy` tries to auto-provision them and fails without KV permissions. Fixed by stripping them in `package.json` postbuild step. We don't use Astro sessions (Supabase handles auth) or Cloudflare Images.

6. **`wrangler.jsonc` main field must stay as `@astrojs/cloudflare/entrypoints/server`** for `astro sync` to work before a build exists. `wrangler deploy` ignores this and uses the redirected `dist/server/wrangler.json` automatically. Commit `b89d622`.

7. **Phase 5 Git integration is GitHub Actions, not Cloudflare dashboard.** Workers have no native Git integration. Added deploy step to `.github/workflows/ci.yml` (runs on push to `main` only).

8. **CI was targeting `master` branch** but repo uses `main`. Fixed in `ci.yml`.

---

## Commit history (deploy-related)

| SHA | Description |
|---|---|
| `c016fbe` | Rename project in wrangler.jsonc to hema-companion |
| `0dbf9cd` | Remove fetch_iterable_type_support (now default) |
| `bf69aff` | Configure wrangler for Workers; postbuild strips SESSION/IMAGES |
| `a1e0f4f` | CI: fix branch to main, add deploy step |
| `b89d622` | Revert wrangler.jsonc main for astro sync compatibility |

---

## Phase 0 — Code patches

- [x] Rename project in `wrangler.jsonc` — `hema-companion`
- [x] Compatibility flags corrected
- [x] Postbuild script strips SESSION/IMAGES bindings from `dist/server/wrangler.json`
- [x] All committed on `main`

---

## Phase 1 — Cloudflare account & API token

- [x] Cloudflare account exists
- [x] Workers subdomain registered: `hemacompanion` (URL prefix: `hub-rad1`)
- [!] All tokens used during this session must be rotated — exposed in conversation
- [!] GitHub Actions uses `CLOUDFLARE_API_TOKEN` secret — create a dedicated token with `Workers Scripts → Edit` scope and add to GitHub; revoke the session tokens

---

## Phase 2 — Supabase production project

- [x] Project created — ref: `welwzvjoqvutnuhqnckw`
- [x] `SUPABASE_URL` and `SUPABASE_KEY` set as Worker runtime secrets
- [x] **Configure auth redirect URLs:**
  - Site URL: `https://hema-companion.hub-rad1.workers.dev`
  - Redirect URLs: `https://hema-companion.hub-rad1.workers.dev/**`
- [ ] Database migrations (deferred — no schema yet)
- [ ] RLS on every table when schema is created

---

## Phase 3 — First deploy

- [x] Worker created and deployed via `wrangler deploy`
- [x] Production URL: `https://hema-companion.hub-rad1.workers.dev`
- [x] Secrets set: `SUPABASE_URL`, `SUPABASE_KEY`

---

## Phase 4 — Smoke test

- [x] Site loads (confirmed by user)
- [x] Auto-deploy via GitHub Actions verified — title change deployed end-to-end
- [x] Auth flow confirmed working end-to-end (sign up → confirm email → sign in → dashboard → sign out)

---

## Phase 5 — Auto-deploy on merge

- [x] `.github/workflows/ci.yml` updated: branch `main`, deploy step on push
- [x] GitHub secrets added: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`, `SUPABASE_KEY`
- [x] First CI run green (commit `b89d622`)
- [x] Deploy step verified working

**How it works:** PR → lint+build only (no deploy). Merge to `main` → lint+build+deploy. Check Actions tab or Cloudflare Workers → Deployments to confirm each merge deployed.

---

## Phase 6 — Post-deploy hardening

- [ ] Custom domain (deferred post-MVP) — add via Workers & Pages → hema-companion → Settings → Domains. Then update Supabase auth URLs.

---

## Rollback procedure

```bash
# List deployments
npx wrangler deployments list

# Roll back to a specific version
npx wrangler rollback <version-id>
```

Or: Cloudflare dashboard → Workers & Pages → hema-companion → Deployments → **Rollback**.

> Rolling back the Worker does NOT roll back Supabase schema migrations.

---

## Secrets inventory

| Secret | Where stored | Rotation |
|---|---|---|
| `SUPABASE_URL` | Cloudflare Worker runtime secret | Only if Supabase project recreated |
| `SUPABASE_KEY` | Cloudflare Worker runtime secret | Rotate in Supabase → API keys, then `wrangler secret put SUPABASE_KEY` |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret | Rotate in Cloudflare → API Tokens; update GitHub secret |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secret | Static — only changes if account changes |

**No tokens committed to the repo.**
