# code-review-agent

A small, **independent** package (own `package.json` / `node_modules`) that runs
AI code review on a unified diff using the
[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript). Built to
be dropped into a CI/CD job.

Two entrypoints:

| Command | What it does |
|---|---|
| `npm run review:sample` | **Exploratory** review — free-text findings (`src/review.ts`). |
| `npm run gate:sample` | **CI gate** — schema-forced, machine-checkable verdict with a pass/fail exit code (`src/review-gate.mjs`). |
| `npm run eval` | **Model comparison / regression suite** in promptfoo. |

## Setup

```bash
cd tools/code-review-agent
npm install
cp .env.example .env   # add a real ANTHROPIC_API_KEY for CI
```

Locally the SDK can use your existing Claude Code login; **CI needs
`ANTHROPIC_API_KEY`** (there is no login in CI).

## The acceptance criteria (`src/criteria.mjs`)

The five criteria the gate enforces are the project's own requirements (from
`AGENTS.md` "Hard Rules" + the stack), in **one editable source of truth** that
the prompt, the schema, and the eval all read:

1. `security_rls` — Security & data isolation (RLS, no committed secrets, identity from session, no SQL injection)
2. `type_safety_validation` — TS strict + boundary input validation
3. `correctness_async` — awaited promises, checked `{ data, error }`, correct status codes, no `console.log`
4. `tests_quality_gates` — covered by tests per project conventions; lint + build pass
5. `maintainability_conventions` — follows structure/idioms, minimal focused diff, no dead code

Edit `criteria.mjs` to change what the gate enforces — everything downstream follows.

## The forced shape (`src/schema.mjs`)

The gate's value is the **schema**, not the prose: one assessment per criterion
(`status` / `severity` / `findings`) plus an overall `verdict`. The model is
instructed to return exactly this JSON; `validateReview()` then checks it against
the enum/shape and the gate **fails closed** on anything malformed. The
pass/fail decision (`gate()`) is computed in code from `status`/`verdict` —
never from free text:

```jsonc
{
  "criteria": [
    { "id": "security_rls", "status": "fail", "severity": "critical", "findings": ["..."] },
    /* one per criterion */
  ],
  "verdict": "REQUEST_CHANGES",          // or APPROVE_WITH_COMMENTS | APPROVE
  "summary": "..."
}
```

A change is **BLOCKED** (exit 1) if any criterion is `fail` or the verdict is
`REQUEST_CHANGES`.

## Run the gate

```bash
npm run gate:sample          # vulnerable fixture  -> BLOCKED (exit 1)
npm run gate:clean           # clean fixture       -> PASSED  (exit 0)
npm run gate -- path/to/change.diff
REVIEW_MODEL=claude-sonnet-4-6 npm run gate -- path/to/change.diff
```

`REVIEW_MODEL` overrides the model (default `claude-opus-4-8`).

## Model comparison + regression suite (`promptfoo/`)

`npm run eval` runs the **same** review function (via a custom provider) across
`opus-4-8`, `sonnet-4-6`, and `haiku-4-5` on the same diffs, asserting the
expected verdict per case. It answers "cheaper vs pricier model" with a hard
matrix (pass/fail + cost + latency) and doubles as a regression gate when you
change the criteria or prompt.

```bash
npm run eval         # run the matrix
npm run eval:view    # open the results UI (per-cell cost & latency)
```

**Finding (current prompt):** `opus-4-8` and `sonnet-4-6` both pass every case;
`haiku-4-5` false-positives on the clean diff (flags validated input as
unvalidated) and would block good PRs. → Gate on **sonnet-4-6** for a cheaper CI
run that still matches opus; do **not** gate on haiku.

## Troubleshooting

- **`ANTHROPIC_API_KEY not set`** — fine locally (uses the Claude Code login);
  set it in CI.
- **`error_max_turns`** — the structured review runs single-shot with `tools: []`
  and `maxTurns: 1`; don't re-enable tools for the gate path.
- **promptfoo: `Could not locate the bindings file` (better-sqlite3)** — on
  Node 24 the bundled v11 has no prebuilt binary. This package pins
  `better-sqlite3@^12` via `overrides` (v12 ships a Node 24 prebuild), so
  `npm install` needs no Python/C++ toolchain.
