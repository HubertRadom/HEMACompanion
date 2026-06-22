/**
 * promptfoo custom provider. Wraps the real structured-review function so the
 * eval compares models against the exact code path the CI gate uses. The
 * rendered prompt is just the diff text; the provider builds the criteria
 * prompt and forces the schema. Returns cost + token usage so promptfoo's
 * matrix shows pass/fail alongside $ and latency.
 */

import { runStructuredReview } from "../src/structured-review.mjs";

export default class ReviewProvider {
  constructor(options = {}) {
    this.config = options.config ?? {};
    this.providerId = options.id ?? `review:${this.config.model ?? "default"}`;
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    const run = await runStructuredReview({ diff: prompt, model: this.config.model });
    if (!run.ok) {
      return { error: `agent did not complete: ${run.subtype}` };
    }
    return {
      output: JSON.stringify(run.result),
      cost: run.costUsd,
      tokenUsage: run.usage
        ? {
            prompt: run.usage.input_tokens ?? 0,
            completion: run.usage.output_tokens ?? 0,
            total: (run.usage.input_tokens ?? 0) + (run.usage.output_tokens ?? 0),
          }
        : undefined,
      metadata: { model: run.model, durationMs: run.durationMs },
    };
  }
}
