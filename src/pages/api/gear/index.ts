import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { GEAR_CATEGORIES } from "@/lib/gear-categories";
import type { GearCategory } from "@/lib/gear-categories";

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

  const form = await context.request.formData();
  const name = (form.get("name") as string | null)?.trim() ?? "";
  const category = (form.get("category") as string | null) ?? "";
  const brand = (form.get("brand") as string | null)?.trim() ?? null;
  const model = (form.get("model") as string | null)?.trim() ?? null;

  if (!name) {
    return context.redirect(`/gear/add?error=${encodeURIComponent("Name is required")}`);
  }
  if (!GEAR_CATEGORIES.includes(category as GearCategory)) {
    return context.redirect(`/gear/add?error=${encodeURIComponent("Invalid category")}`);
  }

  const { error } = await supabase.from("gear_items").insert({
    user_id: user.id,
    name,
    category,
    brand,
    model,
  });

  if (error) {
    return context.redirect(`/gear/add?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/gear");
};
