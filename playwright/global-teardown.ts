import { createClient } from "@supabase/supabase-js";

export default async function globalTeardown(): Promise<void> {
  const userId = process.env.E2E_USER_ID;
  if (!userId) return;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return;

  const db = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await db.auth.admin.deleteUser(userId);
}
