---
project: HEMA Companion
researched_at: 2026-05-28
recommended_platform: Cloudflare Pages
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6
  runtime: Cloudflare Workers (V8 isolate)
  database: Supabase (external)
---

## Recommendation

**Deploy on Cloudflare Pages.**

Cloudflare Pages is the stack-native choice: the `10x-astro-starter` already names it as the deployment target, the `@astrojs/cloudflare` adapter is GA and actively maintained, and the Free tier covers up to ~3 million SSR requests per month at $0 — comfortably above any realistic MVP traffic ceiling for a solo HEMA practitioner app. Developer familiarity with Cloudflare Workers/Pages eliminates the onboarding cost that would otherwise apply to Vercel or Netlify. The platform scores Pass on all five agent-friendly criteria — CLI-first (`wrangler`), fully managed/serverless, agent-readable docs (`llms.txt` + GitHub markdown source), stable deploy API, and a GA MCP server suite covering 137 platform actions.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Score |
|---|---|---|---|---|---|---|
| **Cloudflare Pages** | Pass | Pass | Pass | Pass | Pass | **5 Pass** |
| **Vercel** | Pass | Pass | Pass | Pass | Pass | **5 Pass** |
| **Netlify** | Pass | Pass | Pass (llms.txt confirmed) | Pass | Pass | **5 Pass** |
| **Fly.io** | Pass | Partial | Partial | Pass | Fail | 3 Pass / 2 ↓ |
| **Railway** | Pass | Partial | Fail | Pass | Fail | 3 Pass / 2 ↓ |
| **Render** | Partial | Partial | Fail | Partial | Fail | 1 Pass / 4 ↓ |

**Scoring notes:**

- **Fly.io**: No free tier since late 2024 (~$1.94/month minimum); container-based (more moving parts than serverless); docs are HTML-only with no confirmed `llms.txt`; no MCP server. Penalised by the cost-minimisation constraint.
- **Railway**: $5/month Hobby minimum (no sustained free tier); container/Nixpacks model; JS-rendered docs with no confirmed `llms.txt`; no MCP server. Penalised by cost constraint.
- **Render**: Free tier spins down after 15 minutes (30–60 s cold start — unusable for production); paid starts at $7/month; weakest CLI surface (deploy hooks rather than a first-class CLI); no MCP server.

### Shortlisted Platforms

#### 1. Cloudflare Pages (Recommended)

Native target for the `10x-astro-starter`, $0 at MVP scale, full CLI coverage via `wrangler`, agent-readable docs via `developers.cloudflare.com/llms.txt` and the GitHub-hosted markdown source, and a GA remote MCP server covering 137 platform actions including Pages deployments, Workers secrets, and KV. Developer familiarity breaks the tie with Vercel. The two main runtime constraints — V8 isolate vs. Node.js and the 1 MB Free-tier bundle limit — are manageable with the `nodejs_compat` flag and a bundle-size check in CI.

#### 2. Vercel

Scores identically on all five criteria: GA `vercel` CLI, managed Node.js serverless functions, clean markdown docs with a GA MCP at `mcp.vercel.com`, and a stable deploy API. The Hobby plan is free at 1 million invocations/month. The gap vs. Cloudflare is familiarity and the Hobby plan's 12-function-per-deployment limit (triggerable on a route-heavy Astro app using `functionPerRoute: true`). Strong runner-up; swap here if V8 runtime compatibility becomes a persistent pain point.

#### 3. Netlify

Also scores Pass on all five criteria after confirming a published `llms.txt` at `docs.netlify.com/llms.txt` and a GA official MCP server (`@netlify/mcp`). The free tier constraint is more complex than Cloudflare or Vercel: pricing moved to a credit model in September 2025, and the free allotment of ~300 credits/month translates to approximately 20 deploys/month — tight for active solo development. The absence of a `netlify rollback` CLI command (rollback requires the REST API or dashboard) and no CLI log-tail are operational gaps relative to Cloudflare and Vercel.

## Anti-Bias Cross-Check: Cloudflare Pages

### Devil's Advocate — Weaknesses

1. **V8 isolate ≠ Node.js runtime.** The `nodejs_compat` flag covers most common packages, but packages importing `fs`, `child_process`, `net`, or non-standard ICU paths throw at runtime — not at build time. Local dev (`npm run dev` via Vite) runs on Node.js and masks these failures; only `wrangler dev --remote` catches them before production.

2. **1 MB compressed bundle limit on the Free plan.** An Astro SSR bundle with Supabase client, auth middleware, and several route handlers can approach or exceed this ceiling. Exceeding it fails the deploy silently until you run `wrangler pages deploy --dry-run`; the fix is an unplanned upgrade to Workers Paid ($5/month).

3. **Rollback is a multi-step CLI operation.** There is no `wrangler pages rollback` command. Reverting requires: `wrangler pages deployment list --project-name <name>` (find the target deployment ID), then `wrangler pages deployment create --project-name <name> <deployment-id>`. The exact flags have changed across `wrangler` major versions; agents relying on memorised commands may fail here.

4. **`wrangler pages deploy` and `wrangler deploy` are not interchangeable.** Pages projects use `wrangler pages deploy <dist-dir>`; standalone Workers use `wrangler deploy`. Using the wrong command either errors cryptically or deploys to the wrong project type — a common agent confusion point when copying general Cloudflare Worker docs into a Pages context.

5. **Preview deployments are publicly accessible by default.** Every branch push creates a live, crawlable preview URL with no access control. For a pre-launch app, Cloudflare Access must be manually configured on the preview domain — it is not automatic during Pages project creation.

### Pre-Mortem — How This Could Fail

The HEMA Companion launched cleanly on Cloudflare Pages. Auth, gear management, fight logging, and stats all passed local tests and worked at launch. Six months later, a date-formatting library was added to the stats view for localised date display. The library used an `Intl.DateTimeFormat` path that depended on full ICU data — available in Node.js locally but missing in the Workers V8 isolate. The bug appeared only in production, only for non-English browser locales, and only on the stats route. `wrangler tail` produced a cryptic isolate termination without a useful stack trace. Reproducing it required learning about `wrangler dev --remote`, which had never been part of the development workflow. Three days of debugging resolved in a one-line library swap.

Simultaneously, a PDF export feature requested by several practitioners pulled in a library that pushed the SSR bundle past the 1 MB Free-tier ceiling. Upgrading to Workers Paid ($5/month) fixed it immediately, but the cost was not in the initial budget. Neither failure was in the Cloudflare marketing materials, the Astro adapter docs, or the initial platform decision — both were consequences of the Free-tier bundle cap and the V8/Node.js runtime divergence compounding as the app grew beyond its initial scope.

### Unknown Unknowns

- **`wrangler dev` is not the V8 isolate runtime.** Standard `wrangler dev` runs a local simulation on Node.js. Runtime-specific bugs (missing ICU data, absent Node API) only surface in `wrangler dev --remote` or production. The local dev loop is fast but not faithful to the deployment target.
- **Supabase Realtime cannot be server-subscribed from a Pages Function.** Workers/Pages Functions terminate after the response is sent. If the app ever needs server-side Supabase Realtime subscriptions (e.g., live fight log pushes), it requires Durable Objects (paid, non-trivial) or a shift to client-side subscriptions.
- **`@astrojs/cloudflare` adapter is version-coupled to Astro.** An Astro minor-version upgrade may require an adapter upgrade that changes `wrangler.toml` configuration keys. Running a mismatched pair can produce subtle runtime errors without a clear build failure.
- **`wrangler pages deploy` command syntax has shifted across major versions.** `wrangler pages deploy <dir>` was the canonical form; newer versions derive `outputDir` from `wrangler.toml`. Agents or CI scripts using memorised commands from older docs or training data may trigger deprecation warnings or deploy the wrong directory.

## Operational Story

- **Preview deploys**: Every `git push` to a non-production branch creates a public preview URL automatically (GA). Preview URLs are publicly accessible by default — configure Cloudflare Access on the `*.pages.dev` preview subdomain manually if the project must stay private before launch.
- **Secrets**: Set via `wrangler pages secret put <KEY>` (non-interactive) or in the Cloudflare Dashboard → Pages project → Settings → Environment Variables. Secrets are encrypted at rest, accessible only to the Workers runtime at request time. Rotation: `wrangler pages secret put <KEY>` with the new value; takes effect on the next deployment.
- **Rollback**: `wrangler pages deployment list --project-name <project>` to find the target deployment ID, then `wrangler pages deployment create --project-name <project> <deployment-id>` to redeploy it. Time-to-revert is typically under 60 seconds. Note: database migrations (Supabase schema changes) do not roll back automatically — schema changes must be managed separately.
- **Approval**: Human-only actions: creating or deleting the Pages project, rotating the Cloudflare API token, any DNS record changes, billing tier changes. Agents may deploy, tail logs, set/update secrets, and list deployments unattended.
- **Logs**: `wrangler pages deployment tail <deployment-url>` for live log streaming from a deployed Pages Function. `wrangler tail <worker-name>` for standalone Workers. Both exit with Ctrl+C; output is line-buffered JSON in non-TTY mode.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| V8 runtime rejects a Node.js npm package at runtime | Devil's advocate | Medium | High | Run `wrangler dev --remote` in CI smoke tests; audit `nodejs_compat` gaps before adding new dependencies |
| 1 MB bundle limit (Free) triggers failed deploy | Devil's advocate | Medium | Medium | Add `wrangler pages deploy --dry-run` as a CI step; upgrade to Workers Paid ($5/mo) proactively if bundle approaches 800 KB |
| Agent uses `wrangler deploy` instead of `wrangler pages deploy` | Devil's advocate | Medium | Low | Document the correct command in AGENTS.md; include `--project-name` flag to make the target explicit |
| Rollback multi-step CLI fails under agent execution | Devil's advocate | Low | Medium | Pre-document rollback steps in runbook; prefer dashboard "Publish Deploy" for manual rollbacks |
| Preview URLs expose pre-launch app publicly | Unknown unknowns | High (without mitigation) | Low | Configure Cloudflare Access on the preview subdomain during project setup, before the first branch push |
| ICU / Intl data gaps cause locale-specific production failures | Pre-mortem | Low | Medium | Test with `wrangler dev --remote` against non-English locales; prefer lightweight date libs over Intl-heavy ones |
| Supabase Realtime server-side subscription impossible | Unknown unknowns | Low (not in PRD) | Low | Keep Supabase Realtime subscriptions client-side; flag before any server-side realtime feature is scoped |
| `@astrojs/cloudflare` adapter version mismatch after Astro upgrade | Unknown unknowns | Medium | Medium | Pin adapter version in `package.json`; review adapter changelog before any Astro major/minor upgrade |

## Getting Started

1. **Install Wrangler**: already included in the `10x-astro-starter` devDependencies (`wrangler`). Verify with `npx wrangler --version`.
2. **Add the Cloudflare adapter**: `npx astro add cloudflare` — installs `@astrojs/cloudflare` and adds the adapter to `astro.config.mjs` with `output: 'server'`.
3. **Authenticate with Cloudflare**: `npx wrangler login` (browser OAuth) or set `CLOUDFLARE_API_TOKEN` as an environment variable for CI.
4. **Create the Pages project and deploy**:
   ```bash
   npm run build
   npx wrangler pages deploy dist --project-name hema-companion
   ```
   On first run, Wrangler creates the Pages project automatically.
5. **Set production secrets** (Supabase URL + anon key):
   ```bash
   npx wrangler pages secret put PUBLIC_SUPABASE_URL --project-name hema-companion
   npx wrangler pages secret put PUBLIC_SUPABASE_ANON_KEY --project-name hema-companion
   ```
6. **Connect the GitHub repo** in the Cloudflare Dashboard → Pages → project → Settings → Git integration to enable automatic deployments on push to `main`.
7. **Enable `nodejs_compat`**: add `compatibility_flags = ["nodejs_compat"]` under `[vars]` in `wrangler.toml` (or `wrangler.json`) to prevent Node.js API failures in packages that expect a Node runtime.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions workflow file)
- Production-scale architecture (multi-region, HA, disaster recovery)
