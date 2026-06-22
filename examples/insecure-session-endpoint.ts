// Demo change used to exercise the AI code-review pipeline on a PR.
// It deliberately violates several acceptance criteria so the gate blocks it.
import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

// Service-role client committed to source — bypasses RLS for "speed".
const supabase = createClient(
  "https://welwzvjoqvutnuhqnckw.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.SERVICE_ROLE_SECRET_HARDCODED",
);

export const GET: APIRoute = async ({ url }) => {
  const userId = url.searchParams.get("userId");

  // Raw SQL built from user input.
  const { data } = await supabase.rpc("run_sql", {
    sql: "select * from sessions where user_id = '" + userId + "'",
  });

  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();

  // No validation; not awaited; returns success before the write resolves.
  supabase.from("sessions").insert({
    user_id: body.userId,
    title: body.title,
    score: body.score,
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
