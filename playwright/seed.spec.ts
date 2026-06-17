import { type Page, expect, test } from "@playwright/test";

// Astro wraps hydrateRoot in startTransition, scheduling reconciliation asynchronously.
// Wait for React's fiber marker on a known element to confirm the island is live.
async function waitForReact(page: Page, selector: string) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return el ? Object.keys(el).some((k) => k.startsWith("__reactFiber")) : false;
  }, selector);
}

// Risk #2: Silent fight-save failure.
// The integration suite owns the DB-level oracle (query the row after insert).
// This spec owns the browser oracle: after a successful UI save, the fight must
// appear in the fight list — the user-visible proof that persistence happened.
test("risk-2: a logged fight appears in the fight list after save", async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL!;
  const password = process.env.E2E_USER_PASSWORD!;
  // Timestamp suffix makes this fight identifiable if a prior run left stale data.
  const opponent = `Seed-Opponent-${Date.now()}`;

  // --- Sign in ---
  await page.goto("/auth/signin");
  // Wait for React state, not for an arbitrary timeout.
  await waitForReact(page, "input[name='email']");
  // getByRole is the default selector; falls back to locator("#id") when getByLabel is
  // ambiguous — PasswordToggle renders aria-label="Show password", which Playwright
  // substring-matches to "Password", causing a strict mode violation.
  await page.getByRole("textbox", { name: "Email" }).pressSequentially(email);
  await page.locator("input[name='password']").pressSequentially(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");

  // --- Log a no-gear fight (gear_set_id is optional — also validates Risk #6) ---
  await page.goto("/fights/add");
  await waitForReact(page, "#opponent_name");
  // pressSequentially fires real keyboard events; page.fill() bypasses React onChange.
  await page.getByRole("textbox", { name: "Opponent" }).pressSequentially(opponent);
  // selectOption fires a real change event — correct for React-controlled <select>.
  await page.selectOption("#weapon_category", "longsword");
  await page.selectOption("#result", "win");
  // getByRole("button") over a CSS submit selector: AppNav renders a Sign Out button
  // earlier in the DOM, so a bare button[type="submit"] click would hit the wrong target.
  await page.getByRole("button", { name: "Save fight" }).click();

  // Redirect to /fights is the success signal; ?error= in the URL indicates failure.
  await expect(page).toHaveURL("/fights");

  // --- Assert persistence via UI state, not via sleep ---
  await expect(page.getByRole("heading", { name: "My Fights" })).toBeVisible();
  await expect(page.getByText(opponent)).toBeVisible();

  // Cleanup: global-teardown.ts deletes the test user after all specs complete;
  // ON DELETE CASCADE on fights removes all rows — no per-test teardown needed.
});
