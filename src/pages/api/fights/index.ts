import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

const WEAPON_CATEGORIES = ["longsword", "sabre", "rapier", "other"] as const;
const FIGHT_RESULTS = ["win", "loss", "draw"] as const;

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
  const opponent_name = (form.get("opponent_name") as string | null)?.trim() ?? "";
  const weapon_category = (form.get("weapon_category") as string | null) ?? "";
  const result = (form.get("result") as string | null) ?? "";
  const date = (form.get("date") as string | null) ?? "";
  const gearSetId = (form.get("gear_set_id") as string | null) ?? "";

  if (!opponent_name) {
    return context.redirect(`/fights/add?error=${encodeURIComponent("Opponent name is required")}`);
  }
  if (!WEAPON_CATEGORIES.includes(weapon_category as (typeof WEAPON_CATEGORIES)[number])) {
    return context.redirect(`/fights/add?error=${encodeURIComponent("Invalid weapon category")}`);
  }
  if (!FIGHT_RESULTS.includes(result as (typeof FIGHT_RESULTS)[number])) {
    return context.redirect(`/fights/add?error=${encodeURIComponent("Invalid result")}`);
  }
  if (!date) {
    return context.redirect(`/fights/add?error=${encodeURIComponent("Date is required")}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return context.redirect(`/fights/add?error=${encodeURIComponent("Invalid date format")}`);
  }
  if (gearSetId) {
    const { data: ownedSet } = await supabase
      .from("gear_sets")
      .select("id")
      .eq("id", gearSetId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!ownedSet) {
      return context.redirect(`/fights/add?error=${encodeURIComponent("Invalid gear set")}`);
    }
  }

  const { error } = await supabase.from("fights").insert({
    user_id: user.id,
    opponent_name,
    weapon_category,
    result,
    date,
    gear_set_id: gearSetId || null,
  });

  if (error) {
    return context.redirect(`/fights/add?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/fights");
};
