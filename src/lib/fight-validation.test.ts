import { describe, expect, it } from "vitest";
import { FIGHT_RESULTS, WEAPON_CATEGORIES } from "./fight-validation";

describe("fight-validation constants", () => {
  it("WEAPON_CATEGORIES contains exactly the supported weapon types (FR-012)", () => {
    expect(WEAPON_CATEGORIES).toStrictEqual(["longsword", "sabre", "rapier", "other"]);
  });

  it("FIGHT_RESULTS contains exactly the supported fight outcomes (FR-012)", () => {
    expect(FIGHT_RESULTS).toStrictEqual(["win", "loss", "draw"]);
  });
});
