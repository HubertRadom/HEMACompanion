/**
 * CI gate entrypoint. Reads a diff, runs the schema-forced review, prints the
 * report + raw JSON, and exits non-zero if the change is BLOCKED. A pipeline
 * step can call this and rely on the exit code to pass or stop a PR.
 *
 *   node src/review-gate.mjs <diff-file>        (defaults to fixtures/sample.diff)
 *   REVIEW_MODEL=claude-sonnet-4-6 node src/review-gate.mjs <diff-file>
 */

import { readFileSync } from "node:fs";
import { runStructuredReview } from "./structured-review.mjs";
import { gate, formatReport } from "./schema.mjs";

const diffPath = process.argv[2] ?? "fixtures/sample.diff";
const model = process.env.REVIEW_MODEL ?? "claude-opus-4-8";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "Note: ANTHROPIC_API_KEY not set — relying on the local Claude Code login. Set it for CI.\n",
  );
}

const diff = readFileSync(diffPath, "utf8");
console.error(`> Gating ${diffPath} with ${model}...\n`);

const run = await runStructuredReview({ diff, model });

if (!run.ok) {
  console.error(`Review did not complete: ${run.subtype}`);
  process.exit(1);
}

console.log(formatReport(run.result));
console.log("\n--- raw structured output ---");
console.log(JSON.stringify(run.result, null, 2));

const decision = gate(run.result);
if (decision.missing.length) {
  console.error(`\nWarning: criteria not assessed: ${decision.missing.join(", ")}`);
}
console.error(
  `\nGate: ${decision.blocking ? "BLOCKED" : "PASSED"}  ` +
    `(model ${run.model}, $${run.costUsd.toFixed(4)}, ${run.durationMs}ms)`,
);

process.exit(decision.blocking ? 1 : 0);
