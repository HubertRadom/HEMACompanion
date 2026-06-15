import { type Page, expect, test } from "@playwright/test";

/**
 * Astro wraps hydrateRoot in startTransition, scheduling reconciliation asynchronously.
 * Wait for React's fiber marker on a known element to confirm the island is live.
 */
async function waitForReact(page: Page, selector: string) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return el ? Object.keys(el).some((k) => k.startsWith("__reactFiber")) : false;
  }, selector);
}

test("critical path: sign in → gear item → gear set → fight → stats", async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL!;
  const password = process.env.E2E_USER_PASSWORD!;

  // Step 1: Sign in
  await page.goto("/auth/signin");
  await waitForReact(page, "input[name='email']");
  await page.locator("input[name='email']").pressSequentially(email);
  await page.locator("input[name='password']").pressSequentially(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");

  // Step 2: Add gear item
  await page.goto("/gear/add");
  await waitForReact(page, "#name");
  await page.locator("#name").pressSequentially("E2E-Sword");
  await page.selectOption("#category", "Longsword");
  await page.getByRole("button", { name: "Save gear item" }).click();
  await expect(page).toHaveURL("/gear");

  // Step 3: Create gear set (checks the only available gear item checkbox)
  await page.goto("/gear-sets/add");
  await waitForReact(page, "#name");
  await page.locator("#name").pressSequentially("E2E-Set");
  await page.locator("input[type='checkbox'][name='item_ids']").check();
  await page.getByRole("button", { name: "Save gear set" }).click();
  await expect(page).toHaveURL("/gear-sets");

  // Step 4: Log fight
  await page.goto("/fights/add");
  await waitForReact(page, "#opponent_name");
  await page.locator("#opponent_name").pressSequentially("E2E-Opponent");
  await page.selectOption("#gear_set_id", { label: "E2E-Set" });
  await page.getByRole("button", { name: "Save fight" }).click();
  await expect(page).toHaveURL("/fights");

  // Step 5: Assert stats page shows the logged fight data
  await page.goto("/stats");
  await expect(page.getByText("E2E-Opponent")).toBeVisible();
  await expect(page.getByText("E2E-Set")).toBeVisible();
  await expect(page.getByText("E2E-Sword")).toBeVisible();
});
