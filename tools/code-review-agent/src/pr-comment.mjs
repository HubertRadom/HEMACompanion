/**
 * CI entrypoint that prints a Markdown PR comment to stdout and exits with the
 * gate code (non-zero = BLOCKED). The workflow captures stdout as the comment
 * body and uses the exit code to pass or fail the check.
 *
 *   node src/pr-comment.mjs <diff-file>
 */

import { readFileSync } from "node:fs";
import { runStructuredReview } from "./structured-review.mjs";
import { gate, formatMarkdown } from "./schema.mjs";

const diffPath = process.argv[2];
const model = process.env.REVIEW_MODEL ?? "claude-opus-4-8";

if (!diffPath) {
  process.stderr.write("usage: node src/pr-comment.mjs <diff-file>\n");
  process.exit(2);
}

const diff = readFileSync(diffPath, "utf8");

if (diff.trim() === "") {
  process.stdout.write("## 🤖 AI code review\n\nNo reviewable changes in this PR.\n");
  process.exit(0);
}

const run = await runStructuredReview({ diff, model });

if (!run.ok) {
  // Fail closed: a review that didn't produce valid output blocks the change.
  process.stdout.write(
    `## 🤖 AI code review — 🛑 review failed\n\nThe agent did not return a valid review (\`${run.subtype}\`). Failing the gate closed.\n`,
  );
  process.exit(1);
}

const decision = gate(run.result);
process.stdout.write(formatMarkdown(run.result, { ...run, decision }));
process.stdout.write("\n");
process.exit(decision.blocking ? 1 : 0);
