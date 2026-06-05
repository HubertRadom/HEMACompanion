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

  const form = await context.request.formData();
  const name = (form.get("name") as string | null)?.trim() ?? "";
  const itemIds = form.getAll("item_ids") as string[];

  if (!name) {
    return context.redirect(`/gear-sets/add?error=${encodeURIComponent("Name is required")}`);
  }
  if (itemIds.length === 0) {
    return context.redirect(`/gear-sets/add?error=${encodeURIComponent("Select at least one gear item")}`);
  }

  const { data: ownedItems, error: itemsCheckError } = await supabase
    .from("gear_items")
    .select("id")
    .in("id", itemIds)
    .eq("user_id", user.id);
  if (itemsCheckError || ownedItems.length !== itemIds.length) {
    return context.redirect(`/gear-sets/add?error=${encodeURIComponent("Invalid gear item selection")}`);
  }

  const { data: gearSetData, error: setError } = await supabase
    .from("gear_sets")
    .insert({ user_id: user.id, name })
    .select("id")
    .single();

  if (setError) {
    return context.redirect(`/gear-sets/add?error=${encodeURIComponent(setError.message)}`);
  }

  const newSetId = gearSetData.id as string;

  const { error: compError } = await supabase
    .from("gear_set_compositions")
    .insert(itemIds.map((itemId) => ({ gear_set_id: newSetId, gear_item_id: itemId })));

  if (compError) {
    await supabase.from("gear_sets").delete().eq("id", newSetId).eq("user_id", user.id);
    return context.redirect(`/gear-sets/add?error=${encodeURIComponent(compError.message)}`);
  }

  return context.redirect("/gear-sets");
};
