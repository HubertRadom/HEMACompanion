/**
 * Shared structured-review core. Used by both the CI gate (review-gate.mjs)
 * and the promptfoo provider, so the gate and the eval exercise the same code.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { CRITERIA, buildCriteriaBlock } from "./criteria.mjs";
import { OUTPUT_SPEC, extractJson, validateReview } from "./schema.mjs";

const SYSTEM_PROMPT = [
  "You are a senior reviewer for an Astro 6 / React 19 / Supabase / Cloudflare",
  "Pages / TypeScript-strict codebase. You review a single unified diff against a",
  "fixed set of acceptance criteria and return a structured verdict the CI",
  "pipeline gates on.",
  "",
  `Assess the diff against EACH of these ${CRITERIA.length} criteria. Return exactly`,
  "one assessment object per criterion, using its id verbatim:",
  "",
  buildCriteriaBlock(),
  "",
  "For each criterion set:",
  "  - status: 'fail' if the diff violates it in a way that should block merge,",
  "    'warning' for a real but non-blocking concern, 'pass' if satisfied or not",
  "    applicable to this diff.",
  "  - severity: worst severity among its findings ('none' when pass).",
  "  - findings: concrete, line-anchored issues; empty array when pass.",
  "",
  "Set verdict to REQUEST_CHANGES if any criterion is 'fail'; APPROVE_WITH_COMMENTS",
  "if there are only warnings; APPROVE if everything passes cleanly. Review only the",
  "changed lines and their immediate context.",
  "",
  OUTPUT_SPEC,
].join("\n");

/**
 * @param {{ diff: string, model?: string }} args
 * @returns {Promise<{ ok: boolean, model: string, durationMs: number, costUsd: number,
 *   result: any, usage?: any, subtype?: string }>}
 */
export async function runStructuredReview({ diff, model = "claude-opus-4-8" }) {
  const start = Date.now();
  const prompt = ["Review this diff:", "", "```diff", diff.trimEnd(), "```"].join("\n");

  /** @type {any} */
  let resultMsg;
  for await (const message of query({
    prompt,
    options: {
      model,
      systemPrompt: SYSTEM_PROMPT,
      // Single-shot review: `tools: []` removes all built-in tools so the model
      // can't go exploring the repo — it answers directly with the JSON.
      tools: [],
      maxTurns: 1,
      permissionMode: "bypassPermissions",
    },
  })) {
    if (message.type === "result") resultMsg = message;
  }

  const durationMs = Date.now() - start;
  const costUsd = resultMsg?.total_cost_usd ?? 0;

  if (!resultMsg || resultMsg.subtype !== "success") {
    return { ok: false, model, durationMs, costUsd, result: null, subtype: resultMsg?.subtype ?? "no_result" };
  }

  // Enforce the schema in code: parse the model's JSON and validate it. The gate
  // only trusts conforming output — malformed reviews fail closed.
  const parsed = extractJson(resultMsg.result);
  const { valid, errors } = validateReview(parsed);
  if (!valid) {
    return { ok: false, model, durationMs, costUsd, usage: resultMsg.usage, result: parsed, subtype: `invalid_output: ${errors.join("; ")}` };
  }

  return { ok: true, model, durationMs, costUsd, usage: resultMsg.usage, result: parsed };
}
