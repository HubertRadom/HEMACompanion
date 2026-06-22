/**
 * The five acceptance criteria the CI/CD review agent gates on.
 *
 * These are the project's own requirements — derived from AGENTS.md "Hard Rules"
 * and the Astro 6 / React 19 / Supabase / Cloudflare / TypeScript-strict stack —
 * not invented by the model. Edit here to change what the gate enforces; the
 * schema, the gate, and the promptfoo eval all read from this single source.
 *
 * @typedef {{ id: string, title: string, description: string }} Criterion
 */

/** @type {Criterion[]} */
export const CRITERIA = [
  {
    id: "security_rls",
    title: "Security & data isolation",
    description:
      "Row Level Security is enforced at the database layer on every Supabase table — one practitioner can never read another's data. No secrets, API keys, or service-role tokens are committed. User identity is derived from the authenticated session/middleware, never from client-supplied input. No raw SQL built by string interpolation (SQL injection).",
  },
  {
    id: "type_safety_validation",
    title: "Type safety & input validation",
    description:
      "TypeScript strict is respected: no `any`, no unsafe casts or non-null assertions used to dodge the type system. Every piece of external input (API route params/bodies, form data) is validated at the boundary before use. Cross-directory imports use the `@/` alias.",
  },
  {
    id: "correctness_async",
    title: "Correctness, async & error handling",
    description:
      "Promises are awaited. Supabase / fetch results have their `{ data, error }` checked and errors surfaced — no silently swallowed failures. Handlers return correct HTTP status codes. No `console.log` in committed code (ESLint flags it).",
  },
  {
    id: "tests_quality_gates",
    title: "Tests & quality gates",
    description:
      "Behaviour-changing code is covered by appropriate tests following project conventions (Vitest unit/integration; Playwright E2E using role/label locators, never `waitForTimeout`, independent + self-cleaning). Lint and build/type-check must pass — CI runs `lint` then `build`.",
  },
  {
    id: "maintainability_conventions",
    title: "Maintainability & conventions",
    description:
      "Change follows the existing structure (components/ layouts/ lib/ pages/ middleware) and Astro/React 19 idioms, matches Prettier style, and is a minimal focused diff with no unrelated churn, dead code, or commented-out blocks. Names are clear.",
  },
];

export const CRITERION_IDS = CRITERIA.map((c) => c.id);

/** Renders the criteria as a numbered block for the system prompt. */
export function buildCriteriaBlock() {
  return CRITERIA.map(
    (c, i) => `${i + 1}. [${c.id}] ${c.title}\n   ${c.description}`,
  ).join("\n");
}
