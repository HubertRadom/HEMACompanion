import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll } from "vitest";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.test.local — run `supabase start` first.",
  );
}

export const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Shared context mutated by beforeAll; valid for the full suite execution.
export const ctx: { userId: string } = { userId: "" };

beforeAll(async () => {
  const { data, error } = await db.auth.admin.createUser({
    email: `test+${Date.now()}@integration.test`,
    password: "test-password-integration",
    email_confirm: true,
  });
  if (error) throw error;
  ctx.userId = data.user.id;
});

afterAll(async () => {
  // ON DELETE CASCADE removes all fights + gear_sets for this user.
  if (ctx.userId) await db.auth.admin.deleteUser(ctx.userId);
});
