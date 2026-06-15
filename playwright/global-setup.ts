import { createClient } from "@supabase/supabase-js";

const E2E_USER_PASSWORD = "e2e-password-playwright";

export default async function globalSetup(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set — run `supabase start` and populate .env.test.local first.",
    );
  }

  const db = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `e2e+${Date.now()}@integration.test`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: E2E_USER_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;

  process.env.E2E_USER_ID = data.user.id;
  process.env.E2E_USER_EMAIL = email;
  process.env.E2E_USER_PASSWORD = E2E_USER_PASSWORD;

  // Warm up Vite's lazy compilation so the first test doesn't hit a cold-start timeout.
  const baseURL = process.env.TEST_BASE_URL ?? "http://localhost:4322";
  await fetch(`${baseURL}/auth/signin`).catch(() => {});
}
