import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { createUserClient, ctx, db, USER_PASSWORD } from "@/test/setup.integration";

describe("fights — Risk #3: IDOR cross-user data isolation", () => {
  let fightId: string;
  let userBClient: SupabaseClient;

  beforeAll(async () => {
    const { data: inserted, error } = await db
      .from("fights")
      .insert({
        user_id: ctx.userId,
        opponent_name: "IDOR-Target",
        weapon_category: "longsword",
        result: "win",
        date: "2026-06-14",
        gear_set_id: null,
      })
      .select("id")
      .single();
    if (error) throw error;
    fightId = inserted.id;

    userBClient = await createUserClient(ctx.userBEmail, USER_PASSWORD);
  });

  it("F: SELECT denied — UserB cannot read UserA's fight (RLS makes row invisible)", async () => {
    const { data } = await userBClient.from("fights").select("*").eq("id", fightId);
    expect(data).toHaveLength(0);
  });

  it("G: UPDATE denied — UserB cannot mutate UserA's fight (original value unchanged)", async () => {
    await userBClient.from("fights").update({ opponent_name: "mutated" }).eq("id", fightId);
    const { data: fight } = await db.from("fights").select("opponent_name").eq("id", fightId).single();
    expect(fight!.opponent_name).toBe("IDOR-Target");
  });

  it("H: DELETE denied — UserB cannot delete UserA's fight (row survives)", async () => {
    await userBClient.from("fights").delete().eq("id", fightId);
    const { data } = await db.from("fights").select("id").eq("id", fightId).maybeSingle();
    expect(data).not.toBeNull();
  });
});
