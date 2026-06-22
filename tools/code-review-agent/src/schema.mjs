/**
 * The forced response shape. This JSON Schema is what turns a fuzzy "review"
 * into a machine-checkable object the CI pipeline can gate on: one assessment
 * per criterion + an overall verdict. The gate's pass/fail decision is computed
 * here from those fields — not left to the model's prose.
 */

import { CRITERION_IDS, CRITERIA } from "./criteria.mjs";

export const STATUSES = ["pass", "warning", "fail"];
export const SEVERITIES = ["none", "low", "medium", "high", "critical"];
export const VERDICTS = ["APPROVE", "APPROVE_WITH_COMMENTS", "REQUEST_CHANGES"];

/**
 * The required JSON shape, embedded in the prompt. Derived from the same
 * constants as the validator, so prompt and gate can never drift.
 */
export const OUTPUT_SPEC = [
  "Return ONLY a JSON object — no markdown fences, no prose before or after.",
  "Exact shape:",
  "{",
  '  "criteria": [   // exactly one object per id listed below',
  `    { "id": <${CRITERION_IDS.join(" | ")}>,`,
  `      "status": "${STATUSES.join('" | "')}",`,
  `      "severity": "${SEVERITIES.join('" | "')}",`,
  '      "findings": [ "concrete issue", ... ]   // [] when status is "pass"',
  "    }",
  "  ],",
  `  "verdict": "${VERDICTS.join('" | "')}",`,
  '  "summary": "one or two sentences"',
  "}",
  `Include exactly one criteria entry for each id: ${CRITERION_IDS.join(", ")}.`,
].join("\n");

/** Pull a JSON object out of model text, tolerating code fences / stray prose. */
export function extractJson(text) {
  if (text == null) return null;
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Validate a parsed review against the schema. The pipeline only trusts output
 * that conforms — anything else is treated as a failed review (fail closed).
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateReview(obj) {
  const errors = [];
  if (!obj || typeof obj !== "object") return { valid: false, errors: ["not an object"] };
  if (!VERDICTS.includes(obj.verdict)) errors.push(`verdict must be one of ${VERDICTS.join("/")}`);
  if (typeof obj.summary !== "string") errors.push("summary must be a string");
  if (!Array.isArray(obj.criteria)) {
    errors.push("criteria must be an array");
    return { valid: errors.length === 0, errors };
  }
  obj.criteria.forEach((c, i) => {
    if (!CRITERION_IDS.includes(c?.id)) errors.push(`criteria[${i}].id invalid: ${c?.id}`);
    if (!STATUSES.includes(c?.status)) errors.push(`criteria[${i}].status invalid: ${c?.status}`);
    if (!SEVERITIES.includes(c?.severity)) errors.push(`criteria[${i}].severity invalid: ${c?.severity}`);
    if (!Array.isArray(c?.findings)) errors.push(`criteria[${i}].findings must be an array`);
  });
  return { valid: errors.length === 0, errors };
}

/** JSON Schema passed to the Agent SDK `outputFormat`. */
export const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    criteria: {
      type: "array",
      description: "Exactly one assessment per acceptance criterion.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", enum: CRITERION_IDS },
          status: { type: "string", enum: STATUSES },
          severity: { type: "string", enum: SEVERITIES },
          findings: {
            type: "array",
            items: { type: "string" },
            description: "Concrete issues for this criterion; empty if pass.",
          },
        },
        required: ["id", "status", "severity", "findings"],
      },
    },
    verdict: { type: "string", enum: VERDICTS },
    summary: { type: "string" },
  },
  required: ["criteria", "verdict", "summary"],
};

/**
 * Deterministic gate decision. A change is BLOCKED if any criterion failed or
 * the verdict is REQUEST_CHANGES. We compute this ourselves so the pipeline
 * never depends on the model's free-text judgement.
 *
 * @param {{ criteria: Array<{id:string,status:string,severity:string,findings:string[]}>, verdict: string }} result
 */
export function gate(result) {
  const criteria = Array.isArray(result?.criteria) ? result.criteria : [];
  const failed = criteria.filter((c) => c.status === "fail");
  const seen = new Set(criteria.map((c) => c.id));
  const missing = CRITERION_IDS.filter((id) => !seen.has(id));
  const blocking = failed.length > 0 || result?.verdict === "REQUEST_CHANGES";
  return { blocking, failed, missing };
}

const ICON = { pass: "✓", warning: "!", fail: "✗" };

/** Human-readable report for logs / PR comments. */
export function formatReport(result) {
  const byId = new Map((result?.criteria ?? []).map((c) => [c.id, c]));
  const lines = ["Code review — per-criterion assessment", ""];
  for (const c of CRITERIA) {
    const a = byId.get(c.id);
    if (!a) {
      lines.push(`  ? ${c.title} [${c.id}] — NOT ASSESSED`);
      continue;
    }
    const sev = a.status === "pass" ? "" : ` (${a.severity})`;
    lines.push(`  ${ICON[a.status] ?? "?"} ${c.title} [${c.id}]: ${a.status}${sev}`);
    for (const f of a.findings ?? []) lines.push(`      - ${f}`);
  }
  lines.push("", `Verdict: ${result?.verdict}`, `Summary: ${result?.summary}`);
  return lines.join("\n");
}

const MD_STATUS = { pass: "✅", warning: "🟡", fail: "❌" };
const MD_VERDICT = { APPROVE: "✅", APPROVE_WITH_COMMENTS: "🟡", REQUEST_CHANGES: "🛑" };

/** Markdown report for a PR comment. `meta` carries model/cost/decision. */
export function formatMarkdown(result, meta = {}) {
  const byId = new Map((result?.criteria ?? []).map((c) => [c.id, c]));
  const lines = [];
  lines.push(`## 🤖 AI code review — ${MD_VERDICT[result?.verdict] ?? ""} ${String(result?.verdict ?? "").replace(/_/g, " ")}`);
  lines.push("", result?.summary ?? "", "");
  lines.push("| Criterion | Status | Severity |", "|---|---|---|");
  for (const c of CRITERIA) {
    const a = byId.get(c.id);
    if (!a) {
      lines.push(`| ${c.title} | ⚪ not assessed | – |`);
      continue;
    }
    lines.push(`| ${c.title} | ${MD_STATUS[a.status] ?? "?"} ${a.status} | ${a.status === "pass" ? "–" : a.severity} |`);
  }
  lines.push("");
  for (const c of CRITERIA) {
    const a = byId.get(c.id);
    if (!a || !(a.findings?.length > 0)) continue;
    lines.push(`<details><summary>${MD_STATUS[a.status]} <strong>${c.title}</strong> (${a.severity})</summary>`, "");
    for (const f of a.findings) lines.push(`- ${f}`);
    lines.push("", "</details>");
  }
  const d = meta.decision ?? gate(result ?? {});
  lines.push(
    "",
    `**Gate: ${d.blocking ? "🛑 BLOCKED" : "✅ PASSED"}** · model \`${meta.model ?? "?"}\` · ` +
      `$${(meta.costUsd ?? 0).toFixed(4)} · ${meta.durationMs ?? "?"}ms`,
    "",
    "<sub>🤖 Generated by code-review-agent (Claude Agent SDK). Criteria live in `tools/code-review-agent/src/criteria.mjs`.</sub>",
  );
  return lines.join("\n");
}
