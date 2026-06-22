import { readFileSync } from "node:fs";
import { query } from "@anthropic-ai/claude-agent-sdk";

/**
 * First version of a scripted code-review agent.
 *
 * It feeds a unified diff to Claude through the Claude Agent SDK and prints a
 * structured review. No filesystem/tool access is granted — this is a single,
 * deterministic review pass over the diff text, the shape we will later run in CI.
 */

const SYSTEM_PROMPT = [
  "You are a senior software engineer performing a focused code review of a single",
  "unified diff. Review ONLY the changed lines and their immediate context.",
  "",
  "Report every issue you find — bugs, security problems, data-loss/race conditions,",
  "missing validation, and clear maintainability problems. Do not silently drop a",
  "finding because it seems low-severity; a human will triage afterwards.",
  "",
  "For each finding output:",
  "  - file and approximate line",
  "  - severity: critical | high | medium | low",
  "  - confidence: high | medium | low",
  "  - a one-line explanation and a concrete suggested fix",
  "",
  "End with a one-line verdict: APPROVE, APPROVE WITH COMMENTS, or REQUEST CHANGES.",
  "Be concise. Do not restate the diff.",
].join("\n");

const MODEL = process.env.REVIEW_MODEL ?? "claude-opus-4-8";

function buildPrompt(diff: string): string {
  return [
    "Review the following diff:",
    "",
    "```diff",
    diff.trimEnd(),
    "```",
  ].join("\n");
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    // Not fatal: the Agent SDK falls back to the local Claude Code login if one
    // exists. In CI there is no login, so set ANTHROPIC_API_KEY (see .env.example).
    console.error(
      "Note: ANTHROPIC_API_KEY not set — relying on the local Claude Code login.\n" +
        "      For CI, set ANTHROPIC_API_KEY (copy .env.example to .env).\n",
    );
  }

  const diffPath = process.argv[2] ?? "fixtures/sample.diff";
  const diff = readFileSync(diffPath, "utf8");

  console.error(`> Reviewing ${diffPath} with ${MODEL}...\n`);

  let sawText = false;

  for await (const message of query({
    prompt: buildPrompt(diff),
    options: {
      model: MODEL,
      systemPrompt: SYSTEM_PROMPT,
      // Pure text review: no tools, no repo access. Keep it single-shot.
      allowedTools: [],
      maxTurns: 1,
      permissionMode: "bypassPermissions",
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          process.stdout.write(block.text);
          sawText = true;
        }
      }
    } else if (message.type === "result") {
      if (message.subtype !== "success") {
        console.error(`\n\nAgent ended with: ${message.subtype}`);
        process.exitCode = 1;
        return;
      }
      const usd = message.total_cost_usd?.toFixed(4) ?? "n/a";
      console.error(
        `\n\n--- review complete (${message.num_turns} turn(s), $${usd}) ---`,
      );
    }
  }

  if (!sawText) {
    console.error("WARNING: model returned no text — check the logs above.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("\nReview failed:", err);
  process.exitCode = 1;
});
