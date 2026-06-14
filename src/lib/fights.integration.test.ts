import { describe, expect, it } from "vitest";
import { ctx, db } from "@/test/setup.integration";

describe("fights — Risk #2: write-path persistence oracle", () => {
  it("A: persists all fields with correct values (separate select oracle)", async () => {
    const { data: gearSet, error: gearSetError } = await db
      .from("gear_sets")
      .insert({ user_id: ctx.userId, name: "Test Set" })
      .select("id")
      .single();
    expect(gearSetError).toBeNull();

    const { data: inserted, error: insertError } = await db
      .from("fights")
      .insert({
        user_id: ctx.userId,
        opponent_name: "Alice",
        weapon_category: "longsword",
        result: "win",
        date: "2026-06-14",
        gear_set_id: gearSet!.id,
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();

    // Oracle: separate select — never trust the insert return value
    const { data: fight, error: selectError } = await db.from("fights").select("*").eq("id", inserted!.id).single();
    expect(selectError).toBeNull();

    expect(fight!.user_id).toBe(ctx.userId);
    expect(fight!.opponent_name).toBe("Alice");
    expect(fight!.weapon_category).toBe("longsword");
    expect(fight!.result).toBe("win");
    expect(fight!.date).toBe("2026-06-14");
    expect(fight!.gear_set_id).toBe(gearSet!.id);
    expect(fight!.created_at).toEqual(expect.any(String));
    expect(fight!.updated_at).toEqual(expect.any(String));
  });

  it("B: NOT NULL violation on opponent_name returns error !== null", async () => {
    const { error } = await db.from("fights").insert({
      user_id: ctx.userId,
      opponent_name: null as any,
      weapon_category: "longsword",
      result: "win",
      date: "2026-06-14",
    });
    expect(error).not.toBeNull();
  });

  it("C: FK violation on non-existent gear_set_id returns error !== null", async () => {
    const { error } = await db.from("fights").insert({
      user_id: ctx.userId,
      opponent_name: "Bob",
      weapon_category: "longsword",
      result: "loss",
      date: "2026-06-14",
      gear_set_id: crypto.randomUUID(),
    });
    expect(error).not.toBeNull();
  });
});

describe("fights — Risk #6: nullable gear_set_id FK behaviour", () => {
  it("D: fight with gear_set_id = null saves without error", async () => {
    const { data: inserted, error: insertError } = await db
      .from("fights")
      .insert({
        user_id: ctx.userId,
        opponent_name: "Charlie",
        weapon_category: "saber",
        result: "draw",
        date: "2026-06-14",
        gear_set_id: null,
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();

    const { data: fight, error: selectError } = await db.from("fights").select("*").eq("id", inserted!.id).single();
    expect(selectError).toBeNull();
    expect(fight!.gear_set_id).toBeNull();
  });

  it("E: deleting a gear_set sets gear_set_id = null on referencing fights (ON DELETE SET NULL)", async () => {
    const { data: gearSet, error: gearSetError } = await db
      .from("gear_sets")
      .insert({ user_id: ctx.userId, name: "Temp Set" })
      .select("id")
      .single();
    expect(gearSetError).toBeNull();

    const { data: inserted, error: insertError } = await db
      .from("fights")
      .insert({
        user_id: ctx.userId,
        opponent_name: "Dave",
        weapon_category: "longsword",
        result: "win",
        date: "2026-06-14",
        gear_set_id: gearSet!.id,
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();

    const { error: deleteError } = await db.from("gear_sets").delete().eq("id", gearSet!.id);
    expect(deleteError).toBeNull();

    // Fight must survive with gear_set_id nulled out
    const { data: fight, error: selectError } = await db.from("fights").select("*").eq("id", inserted!.id).single();
    expect(selectError).toBeNull();
    expect(fight!.gear_set_id).toBeNull();
  });
});
