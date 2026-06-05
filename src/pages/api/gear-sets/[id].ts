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
  if (!id) return context.redirect("/gear-sets");

  const form = await context.request.formData();
  const name = (form.get("name") as string | null)?.trim() ?? "";
  const itemIds = form.getAll("item_ids") as string[];

  if (!name) {
    return context.redirect(`/gear-sets/${id}/edit?error=${encodeURIComponent("Name is required")}`);
  }
  if (itemIds.length === 0) {
    return context.redirect(`/gear-sets/${id}/edit?error=${encodeURIComponent("Select at least one gear item")}`);
  }

  const { data: ownedItems, error: itemsCheckError } = await supabase
    .from("gear_items")
    .select("id")
    .in("id", itemIds)
    .eq("user_id", user.id);
  if (itemsCheckError || ownedItems.length !== itemIds.length) {
    return context.redirect(`/gear-sets/${id}/edit?error=${encodeURIComponent("Invalid gear item selection")}`);
  }

  const { data: updatedSet, error: updateError } = await supabase
    .from("gear_sets")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return context.redirect(`/gear-sets/${id}/edit?error=${encodeURIComponent(updateError.message)}`);
  }
  if (!updatedSet) {
    return context.redirect(`/gear-sets/${id}/edit?error=${encodeURIComponent("Set not found")}`);
  }

  // Upsert new/kept compositions first, then delete stale ones.
  // Order matters: upsert before delete so a failure never empties the set.
  const { error: upsertError } = await supabase.from("gear_set_compositions").upsert(
    itemIds.map((itemId) => ({ gear_set_id: id, gear_item_id: itemId })),
    { onConflict: "gear_set_id,gear_item_id", ignoreDuplicates: true },
  );

  if (upsertError) {
    return context.redirect(`/gear-sets/${id}/edit?error=${encodeURIComponent(upsertError.message)}`);
  }

  const { error: deleteError } = await supabase
    .from("gear_set_compositions")
    .delete()
    .eq("gear_set_id", id)
    .not("gear_item_id", "in", `(${itemIds.join(",")})`);

  if (deleteError) {
    return context.redirect(`/gear-sets/${id}/edit?error=${encodeURIComponent(deleteError.message)}`);
  }

  return context.redirect("/gear-sets");
};
