import { describe, expect, test } from "vitest";
import { totalFights } from "@/lib/stats";

describe("stats", () => {
  test("totalFights of empty input is 0", () => {
    expect(totalFights([])).toBe(0);
  });
});
