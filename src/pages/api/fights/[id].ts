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

  const id = context.params.id;
  if (!id) return context.redirect("/fights");

  const form = await context.request.formData();
  const opponent_name = (form.get("opponent_name") as string | null)?.trim() ?? "";
  const weapon_category = (form.get("weapon_category") as string | null) ?? "";
  const result = (form.get("result") as string | null) ?? "";
  const date = (form.get("date") as string | null) ?? "";
  const gearSetId = (form.get("gear_set_id") as string | null) ?? "";

  if (!opponent_name) {
    return context.redirect(`/fights/${id}/edit?error=${encodeURIComponent("Opponent name is required")}`);
  }
  if (!WEAPON_CATEGORIES.includes(weapon_category as (typeof WEAPON_CATEGORIES)[number])) {
    return context.redirect(`/fights/${id}/edit?error=${encodeURIComponent("Invalid weapon category")}`);
  }
  if (!FIGHT_RESULTS.includes(result as (typeof FIGHT_RESULTS)[number])) {
    return context.redirect(`/fights/${id}/edit?error=${encodeURIComponent("Invalid result")}`);
  }
  if (!date) {
    return context.redirect(`/fights/${id}/edit?error=${encodeURIComponent("Date is required")}`);
  }

  const { data: updatedFight, error: updateError } = await supabase
    .from("fights")
    .update({
      opponent_name,
      weapon_category,
      result,
      date,
      gear_set_id: gearSetId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return context.redirect(`/fights/${id}/edit?error=${encodeURIComponent(updateError.message)}`);
  }
  if (!updatedFight) {
    return context.redirect(`/fights/${id}/edit?error=${encodeURIComponent("Fight not found")}`);
  }

  return context.redirect("/fights");
};
