import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin?error=Supabase+is+not+configured");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const id = context.params.id;
  if (!id) return context.redirect("/gear");

  const { error } = await supabase.from("gear_items").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    return context.redirect(`/gear?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/gear");
};
