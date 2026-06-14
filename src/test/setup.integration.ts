import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll } from "vitest";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.test.local — run `supabase start` first.",
  );
}

// Guaranteed strings after the throw guard above; stored to avoid non-null assertions in closures.
const validatedUrl: string = supabaseUrl;
const validatedServiceRoleKey: string = serviceRoleKey;

export const db = createClient(validatedUrl, validatedServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const USER_PASSWORD = "test-password-integration";

// Shared context mutated by beforeAll; valid for the full suite execution.
export const ctx: {
  userId: string;
  userAEmail: string;
  userBId: string;
  userBEmail: string;
} = { userId: "", userAEmail: "", userBId: "", userBEmail: "" };

beforeAll(async () => {
  const ts = Date.now();

  const emailA = `test+a${ts}@integration.test`;
  const { data: dataA, error: errorA } = await db.auth.admin.createUser({
    email: emailA,
    password: USER_PASSWORD,
    email_confirm: true,
  });
  if (errorA) throw errorA;
  ctx.userId = dataA.user.id;
  ctx.userAEmail = emailA;

  const emailB = `test+b${ts}@integration.test`;
  const { data: dataB, error: errorB } = await db.auth.admin.createUser({
    email: emailB,
    password: USER_PASSWORD,
    email_confirm: true,
  });
  if (errorB) throw errorB;
  ctx.userBId = dataB.user.id;
  ctx.userBEmail = emailB;
});

afterAll(async () => {
  // ON DELETE CASCADE removes all fights + gear_sets for each user.
  if (ctx.userId) await db.auth.admin.deleteUser(ctx.userId);
  if (ctx.userBId) await db.auth.admin.deleteUser(ctx.userBId);
});

/**
 * Returns an anon Supabase client authenticated as the given user.
 * This client respects RLS — auth.uid() resolves to the signed-in user's id.
 */
export async function createUserClient(email: string, password: string): Promise<SupabaseClient> {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("SUPABASE_ANON_KEY must be set in .env.test.local");
  }
  const base = createClient(validatedUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await base.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return createClient(validatedUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
