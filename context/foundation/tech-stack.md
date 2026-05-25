---
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
---

## Why this stack

HEMA Companion is a solo-built, after-hours web app with a 4-week MVP timeline and a single technology-forcing feature: email/password authentication (FR-001–003). The `10x-astro-starter` is the vetted recommended default for `(web-app, js)` and clears all four agent-friendly quality gates — typed (TypeScript project-wide), convention-based (Astro file-based routing + Supabase schema), popular in training data, and well-documented. Auth ships out of the box via Supabase, so no third-party OAuth wiring is needed, directly matching the PRD's email/password-only constraint. The medium user scale and small data volume (estimated ceiling ~1,000 fights) fit well within Supabase's free tier and Cloudflare Pages edge delivery. CI runs on GitHub Actions with auto-deploy on merge to main — what the starter ships with and the standard solo-team flow.
