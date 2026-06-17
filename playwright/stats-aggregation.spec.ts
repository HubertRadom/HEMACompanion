// Risk #1: Statistics aggregation is wrong.
// Unit tests protect the math in src/lib/stats.ts in isolation.
// This spec protects the FULL PIPELINE: DB query → computeStats() → Astro SSR → browser.
// A regression in the query filter, the call site, or the template would pass unit tests
// and fail here.
//
// Seed: playwright/seed.spec.ts

import { type Page, expect, test } from "@playwright/test";

async function waitForReact(page: Page, selector: string) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return el ? Object.keys(el).some((k) => k.startsWith("__reactFiber")) : false;
  }, selector);
}

async function logFight(
  page: Page,
  opponent: string,
  category: "longsword" | "sabre" | "rapier" | "other",
  result: "win" | "loss" | "draw",
) {
  await page.goto("/fights/add");
  await waitForReact(page, "#opponent_name");
  await page.getByRole("textbox", { name: "Opponent" }).pressSequentially(opponent);
  await page.selectOption("#weapon_category", category);
  await page.selectOption("#result", result);
  await page.getByRole("button", { name: "Save fight" }).click();
  await expect(page).toHaveURL("/fights");
}

test("risk-1: stats page shows correct counts and win-rate after logging fights", async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL!;
  const password = process.env.E2E_USER_PASSWORD!;
  const ts = Date.now();
  // Timestamp suffix makes opponent names unique within this run.
  // opponentA logged twice → will appear in Top Opponents with count 2.
  const opponentA = `Stats-A-${ts}`;
  const opponentB = `Stats-B-${ts}`;

  // --- Sign in ---
  await page.goto("/auth/signin");
  await waitForReact(page, "input[name='email']");
  await page.getByRole("textbox", { name: "Email" }).pressSequentially(email);
  // getByLabel("Password") is ambiguous — PasswordToggle renders aria-label="Show password"
  // which Playwright substring-matches to "Password". Scope to the input directly.
  await page.locator("input[name='password']").pressSequentially(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");

  // --- Log 3 fights, all sabre, no gear set ---
  // Using sabre isolates this test from critical-path.spec.ts (which uses longsword),
  // so winRateByCategory["sabre"] reflects only these 3 fights regardless of run order.
  await logFight(page, opponentA, "sabre", "win");   // fight 1
  await logFight(page, opponentA, "sabre", "loss");  // fight 2
  await logFight(page, opponentB, "sabre", "win");   // fight 3

  // --- Navigate to stats page ---
  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: "My Statistics" })).toBeVisible();

  // Hand-computed oracle — values derived from the PRD rules, not from computeStats():
  //   opponentA:     2 fights  (fight 1 + fight 2)
  //   opponentB:     1 fight   (fight 3)
  //   sabre wins:    2         (fight 1 + fight 3)
  //   sabre total:   3
  //   sabre winrate: Math.round(2/3 × 100) = 67 → "67%"
  //
  // No gear set → gearSetUsage and gearItemCounts are empty → "2 fights" appears only
  // in the Top Opponents section, with no ambiguity from gear sections.

  // Top Opponents: opponentA appears with "2 fights"
  await expect(page.getByText(opponentA)).toBeVisible();
  await expect(page.getByText("2 fights")).toBeVisible();

  // sabre winRateByCategory: 2 wins / 3 sabre fights = Math.round(2/3 × 100) = 67%
  // Scoped to the list item that contains "sabre" so parallel specs adding longsword
  // fights don't shift globalWinRate and invalidate the count-based assertion.
  await expect(
    page.getByRole("listitem").filter({ hasText: "sabre" }).getByText("67%"),
  ).toBeVisible();

  // Cleanup: global-teardown.ts deletes the test user; ON DELETE CASCADE removes all fights.
});
