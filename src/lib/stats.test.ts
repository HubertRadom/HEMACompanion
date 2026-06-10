import { describe, expect, test } from "vitest";
import {
  computeStats,
  fightCountByCategory,
  gearItemCounts,
  gearSetUsage,
  globalWinRate,
  topOpponents,
  totalFights,
  winRateByCategory,
  type CompositionInput,
  type FightInput,
  type GearItemInput,
  type GearSetInput,
} from "@/lib/stats";

// --- Fixture factories ------------------------------------------------------
// Small, readable builders so each test's data is obvious by inspection.
// Defaults to a winning longsword fight with no gear; override per case.
function fight(overrides: Partial<FightInput> = {}): FightInput {
  return {
    weapon_category: "longsword",
    result: "win",
    opponent_name: "Anon",
    gear_set_id: null,
    ...overrides,
  };
}
const item = (id: string, name: string): GearItemInput => ({ id, name });
const set = (id: string, name: string): GearSetInput => ({ id, name });
const comp = (gear_set_id: string, gear_item_id: string): CompositionInput => ({ gear_set_id, gear_item_id });

// Repeat the same opponent across n fights (for the top-opponent cap case).
function repeatOpponent(name: string, n: number): FightInput[] {
  return Array.from({ length: n }, () => fight({ opponent_name: name }));
}

// ===========================================================================
// Case 1 — Empty input
// Oracle: no fights → totalFights 0, winrate sentinel "—", every list empty.
// ===========================================================================
describe("empty input", () => {
  test("all statistics collapse to base values", () => {
    expect(totalFights([])).toBe(0);
    expect(globalWinRate([])).toBe("—");
    expect(fightCountByCategory([])).toEqual([]);
    expect(winRateByCategory([])).toEqual([]);
    expect(topOpponents([])).toEqual([]);
    expect(gearItemCounts([], [], [])).toEqual([]);
    expect(gearSetUsage([], [])).toEqual([]);
  });

  test("computeStats returns the empty view-model", () => {
    expect(computeStats({ fights: [], gearSets: [], gearItems: [], compositions: [] })).toEqual({
      totalFights: 0,
      fightCountByCategory: [],
      globalWinRate: "—",
      winRateByCategory: [],
      topOpponents: [],
      gearItemCounts: [],
      gearSetUsage: [],
    });
  });
});

// ===========================================================================
// Case 2 — Single fight (100% / 0% winrate per result)
// Oracle: 1 win → 1/1 = 100%; 1 loss → 0/1 = 0%.
// ===========================================================================
describe("single fight", () => {
  test("a single win is 100% overall and per category", () => {
    const fights = [fight({ weapon_category: "longsword", result: "win", opponent_name: "Alice" })];
    expect(totalFights(fights)).toBe(1);
    expect(globalWinRate(fights)).toBe("100%");
    expect(fightCountByCategory(fights)).toEqual([{ category: "longsword", count: 1 }]);
    expect(winRateByCategory(fights)).toEqual([{ category: "longsword", total: 1, rate: "100%" }]);
    expect(topOpponents(fights)).toEqual([{ name: "Alice", count: 1 }]);
  });

  test("a single loss is 0%", () => {
    const fights = [fight({ result: "loss" })];
    expect(globalWinRate(fights)).toBe("0%");
    expect(winRateByCategory(fights)).toEqual([{ category: "longsword", total: 1, rate: "0%" }]);
  });
});

// ===========================================================================
// Case 3 — W/L/D mix (pins the denominator decision: wins / totalFights)
// Oracle: draws and losses are BOTH in the denominator.
//   1W/1L/1D → 1/3 → Math.round(33.33) = 33 → "33%"
//   2W/1L    → 2/3 → Math.round(66.66) = 67 → "67%"
// ===========================================================================
describe("win/loss/draw mix — denominator is total fights", () => {
  test("1 win / 1 loss / 1 draw → 33%", () => {
    const fights = [
      fight({ result: "win", opponent_name: "A" }),
      fight({ result: "loss", opponent_name: "B" }),
      fight({ result: "draw", opponent_name: "C" }),
    ];
    expect(totalFights(fights)).toBe(3);
    expect(globalWinRate(fights)).toBe("33%");
    // longsword category mirrors the global denominator here (all longsword).
    expect(winRateByCategory(fights)).toEqual([{ category: "longsword", total: 3, rate: "33%" }]);
  });

  test("2 wins / 1 loss → 67% (rounds half-up via Math.round)", () => {
    const fights = [
      fight({ result: "win", opponent_name: "A" }),
      fight({ result: "win", opponent_name: "B" }),
      fight({ result: "loss", opponent_name: "C" }),
    ];
    expect(globalWinRate(fights)).toBe("67%");
  });
});

// ===========================================================================
// Case 4 — Multi-category (independent counts/rates; fixed order; filtering)
// Fixture: longsword W, longsword L, sabre W, rapier L.  (no "other")
// Oracle:
//   counts: longsword 2, sabre 1, rapier 1, other 0(dropped)
//           fixed order ["longsword","sabre","rapier","other"]
//   global winrate: wins=2 (longsword W + sabre W) / total 4 = 50%
//   per-category: longsword 1/2=50%, sabre 1/1=100%, rapier 0/1=0%, other dropped
// ===========================================================================
describe("multi-category", () => {
  const fights = [
    fight({ weapon_category: "longsword", result: "win", opponent_name: "A" }),
    fight({ weapon_category: "longsword", result: "loss", opponent_name: "B" }),
    fight({ weapon_category: "sabre", result: "win", opponent_name: "C" }),
    fight({ weapon_category: "rapier", result: "loss", opponent_name: "D" }),
  ];

  test("counts are per-category, fixed order, and drop empty categories", () => {
    expect(fightCountByCategory(fights)).toEqual([
      { category: "longsword", count: 2 },
      { category: "sabre", count: 1 },
      { category: "rapier", count: 1 },
    ]);
  });

  test("global winrate spans all categories", () => {
    expect(globalWinRate(fights)).toBe("50%");
  });

  test("per-category rates are independent and ordered, empty categories dropped", () => {
    expect(winRateByCategory(fights)).toEqual([
      { category: "longsword", total: 2, rate: "50%" },
      { category: "sabre", total: 1, rate: "100%" },
      { category: "rapier", total: 1, rate: "0%" },
    ]);
  });
});

// ===========================================================================
// Case 5 — Out-of-set category / result values (no DB CHECK constraint)
// Fixture: longsword win, messer win, longsword no-contest.
// Oracle:
//   - "messer" fight: counted in totalFights and in the global winrate
//     denominator (and its "win" result counts as a win), but appears in NO
//     category row.
//   - "no-contest" result: counted in denominator, not a win.
//   totalFights 3; global wins = 2 (longsword-win + messer-win) / 3 = 67%.
//   category rows: longsword only → total 2 (win + no-contest), wins 1 → 50%.
// ===========================================================================
describe("out-of-set category/result values", () => {
  const fights = [
    fight({ weapon_category: "longsword", result: "win", opponent_name: "Alice" }),
    fight({ weapon_category: "messer", result: "win", opponent_name: "Bob" }),
    fight({ weapon_category: "longsword", result: "no-contest", opponent_name: "Carol" }),
  ];

  test("unknown category is in totals but in no category row", () => {
    expect(totalFights(fights)).toBe(3);
    expect(fightCountByCategory(fights)).toEqual([{ category: "longsword", count: 2 }]);
  });

  test("unknown category's win still counts in the global denominator and numerator", () => {
    expect(globalWinRate(fights)).toBe("67%");
  });

  test("per-category rate only sees in-set fights", () => {
    expect(winRateByCategory(fights)).toEqual([{ category: "longsword", total: 2, rate: "50%" }]);
  });
});

// ===========================================================================
// Case 6 — No-gear fight (gear_set_id: null)
// Oracle: a null-gear fight counts toward fight/winrate stats but contributes
// nothing to gearItemCounts or gearSetUsage.
// ===========================================================================
describe("no-gear fight", () => {
  const fights = [fight({ result: "win", gear_set_id: null })];
  const gearItems = [item("i1", "Mask")];
  const gearSets = [set("s1", "Set A")];
  const compositions = [comp("s1", "i1")];

  test("contributes to fight/winrate stats", () => {
    expect(totalFights(fights)).toBe(1);
    expect(globalWinRate(fights)).toBe("100%");
  });

  test("contributes nothing to gear stats", () => {
    expect(gearItemCounts(fights, gearItems, compositions)).toEqual([]);
    expect(gearSetUsage(fights, gearSets)).toEqual([]);
  });
});

// ===========================================================================
// Case 7 — Shared-item gear trace (FR-019 multi-step join)
// Setup: item "Gloves"(i1) is in both Set A(s1) and Set B(s2); "Mask"(i2) only
//        in Set A. Fight f1 uses s1, f2 uses s2.
// Oracle (per-set membership counting):
//   f1(s1) → i1 +1, i2 +1   f2(s2) → i1 +1
//   → Gloves 2, Mask 1  (sorted desc)
//   gearSetUsage: s1 used once, s2 used once → tie kept in first-seen order.
// ===========================================================================
describe("shared-item gear trace", () => {
  const fights = [
    fight({ result: "win", opponent_name: "X", gear_set_id: "s1" }),
    fight({ result: "loss", opponent_name: "Y", gear_set_id: "s2" }),
  ];
  const gearItems = [item("i1", "Gloves"), item("i2", "Mask")];
  const gearSets = [set("s1", "Set A"), set("s2", "Set B")];
  const compositions = [comp("s1", "i1"), comp("s1", "i2"), comp("s2", "i1")];

  test("a shared item accrues a count from each used set", () => {
    expect(gearItemCounts(fights, gearItems, compositions)).toEqual([
      { id: "i1", name: "Gloves", count: 2 },
      { id: "i2", name: "Mask", count: 1 },
    ]);
  });

  test("gear set usage counts fights per set, ties first-seen", () => {
    expect(gearSetUsage(fights, gearSets)).toEqual([
      { id: "s1", name: "Set A", count: 1 },
      { id: "s2", name: "Set B", count: 1 },
    ]);
  });
});

// ===========================================================================
// Case 8 — Opponent ties, >5 cap, exact-string match
// ===========================================================================
describe("top opponents", () => {
  test("equal-count opponents keep first-seen order", () => {
    // "Bravo" is seen before "Alpha"; both end at count 2. First-seen wins the
    // tie (NOT alphabetical — Alpha would sort first if this were sorted by name).
    const fights = [
      fight({ opponent_name: "Bravo" }),
      fight({ opponent_name: "Alpha" }),
      fight({ opponent_name: "Bravo" }),
      fight({ opponent_name: "Alpha" }),
    ];
    expect(topOpponents(fights)).toEqual([
      { name: "Bravo", count: 2 },
      { name: "Alpha", count: 2 },
    ]);
  });

  test("more than five distinct opponents truncate to top 5", () => {
    const fights = [
      ...repeatOpponent("A", 6),
      ...repeatOpponent("B", 5),
      ...repeatOpponent("C", 4),
      ...repeatOpponent("D", 3),
      ...repeatOpponent("E", 2),
      ...repeatOpponent("F", 1),
    ];
    expect(topOpponents(fights)).toEqual([
      { name: "A", count: 6 },
      { name: "B", count: 5 },
      { name: "C", count: 4 },
      { name: "D", count: 3 },
      { name: "E", count: 2 },
    ]);
  });

  test("matching is exact: the same person typed two ways counts separately", () => {
    const fights = [fight({ opponent_name: "Bob" }), fight({ opponent_name: "bob" })];
    expect(topOpponents(fights)).toEqual([
      { name: "Bob", count: 1 },
      { name: "bob", count: 1 },
    ]);
  });
});
