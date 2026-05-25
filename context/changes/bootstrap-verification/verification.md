---
bootstrapped_at: 2026-05-25T21:49:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: hema-companion
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: hema-companion
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

HEMA Companion is a solo-built, after-hours web app with a 4-week MVP timeline and a single technology-forcing feature: email/password authentication (FR-001–003). The `10x-astro-starter` is the vetted recommended default for `(web-app, js)` and clears all four agent-friendly quality gates — typed (TypeScript project-wide), convention-based (Astro file-based routing + Supabase schema), popular in training data, and well-documented. Auth ships out of the box via Supabase, so no third-party OAuth wiring is needed, directly matching the PRD's email/password-only constraint. The medium user scale and small data volume (estimated ceiling ~1,000 fights) fit well within Supabase's free tier and Cloudflare Pages edge delivery. CI runs on GitHub Actions with auto-deploy on merge to main — what the starter ships with and the standard solo-team flow.

## Pre-scaffold verification

| Signal      | Value                                                            | Severity | Notes                                    |
| ----------- | ---------------------------------------------------------------- | -------- | ---------------------------------------- |
| npm package | not run                                                          | n/a      | cmd_template uses `git clone`; no npm CLI invoked |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-05-17T10:33:39Z | fresh    | 8 days ago; from card.docs_url           |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone (clone starter repo without keeping upstream git history)
**Exit code**: 0
**Files moved**: 20 items
**Conflicts (.scaffold siblings)**: CLAUDE.md, README.md
**.gitignore handling**: moved silently (no pre-existing .gitignore in cwd)
**.bootstrap-scaffold cleanup**: empty directory left in place (locked by OS file-system watcher — all files moved successfully; safe to delete manually or will be released on next IDE restart)

### Conflict details

- `CLAUDE.md` — cwd had the lesson-instructions version; starter's CLAUDE.md landed as `CLAUDE.md.scaffold`. Review with `diff CLAUDE.md CLAUDE.md.scaffold` to see what the starter ships vs the lesson content.
- `README.md` — cwd had a prior README.md; starter's README.md landed as `README.md.scaffold`.

### Items moved silently

`.github/`, `.husky/`, `.vscode/`, `node_modules/`, `public/`, `src/`, `supabase/`, `.env.example`, `.gitignore`, `.nvmrc`, `.prettierrc.json`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `package-lock.json`, `package.json`, `tsconfig.json`, `wrangler.jsonc`

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0 CRITICAL/HIGH direct of total 0/1; 2 MODERATE direct (`@astrojs/check`, `wrangler`) of 9 total MODERATE

#### HIGH findings

- **devalue** v5.6.3–5.8.0 — DoS via sparse array deserialization
  - Advisory: [GHSA-77vg-94rm-hx3p](https://github.com/advisories/GHSA-77vg-94rm-hx3p)
  - CVSS: 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H)
  - CWE: CWE-770 (Allocation of Resources Without Limits)
  - Role: transitive (not a direct dependency)
  - Fix: available — `npm audit fix`

#### MODERATE findings (log-only)

1. **@astrojs/check** (direct) — via `@astrojs/language-server` → `volar-service-yaml`; fix available (semver major: downgrade to v0.9.2)
2. **@astrojs/language-server** (transitive) — via `volar-service-yaml`; fix via @astrojs/check downgrade
3. **@cloudflare/vite-plugin** (transitive) — via `miniflare`, `wrangler`, `ws`; fix available
4. **miniflare** (transitive) — via `ws`; fix available
5. **volar-service-yaml** (transitive) — via `yaml-language-server`; fix via @astrojs/check downgrade
6. **wrangler** (direct) — via `miniflare`; fix available
7. **ws** v8.0.0–8.20.0 (transitive) — Uninitialized memory disclosure; [GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx); CVSS 4.4; fix available
8. **yaml** v2.0.0–2.8.2 (transitive) — Stack Overflow via deeply nested YAML; [GHSA-48c2-rrv3-qjmp](https://github.com/advisories/GHSA-48c2-rrv3-qjmp); CVSS 4.3; fix via @astrojs/check downgrade
9. **yaml-language-server** (transitive) — via `yaml`; fix via @astrojs/check downgrade

## Hints recorded but not acted on

| Hint                    | Value              |
| ----------------------- | ------------------ |
| bootstrapper_confidence | first-class        |
| quality_override        | false              |
| path_taken              | standard           |
| self_check_answers      | null               |
| team_size               | solo               |
| deployment_target       | cloudflare-pages   |
| ci_provider             | github-actions     |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true               |
| has_payments            | false              |
| has_realtime            | false              |
| has_ai                  | false              |
| has_background_jobs     | false              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep: `diff CLAUDE.md CLAUDE.md.scaffold`, `diff README.md README.md.scaffold`.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
- `npm audit fix` will address the HIGH `devalue` finding and most MODERATE findings automatically.
