// Pure statistics aggregation for the stats page (Risk #1).
//
// Extracted verbatim from src/pages/stats/index.astro:42-108 — same arithmetic,
// same sentinels, same sort/slice/filter behavior. No I/O: every function is pure
// over its array inputs and returns the exact view-model shapes the page renders.

export const WEAPON_CATEGORIES = ["longsword", "sabre", "rapier", "other"] as const;

// Narrow input shapes — only the fields the aggregation reads.
export interface FightInput {
  weapon_category: string;
  result: string;
  opponent_name: string;
  gear_set_id: string | null;
}
export interface GearItemInput {
  id: string;
  name: string;
}
export interface GearSetInput {
  id: string;
  name: string;
}
export interface CompositionInput {
  gear_set_id: string;
  gear_item_id: string;
}

export interface CategoryCount {
  category: string;
  count: number;
}
export interface CategoryRate {
  category: string;
  total: number;
  rate: string;
}
export interface OpponentCount {
  name: string;
  count: number;
}
export interface NamedCount {
  id: string;
  name: string;
  count: number;
}

export interface StatsInput {
  fights: FightInput[];
  gearSets: GearSetInput[];
  gearItems: GearItemInput[];
  compositions: CompositionInput[];
}

export interface Stats {
  totalFights: number;
  fightCountByCategory: CategoryCount[];
  globalWinRate: string;
  winRateByCategory: CategoryRate[];
  topOpponents: OpponentCount[];
  gearItemCounts: NamedCount[];
  gearSetUsage: NamedCount[];
}

export function totalFights(fights: FightInput[]): number {
  return fights.length;
}

export function fightCountByCategory(fights: FightInput[]): CategoryCount[] {
  return WEAPON_CATEGORIES.map((cat) => ({
    category: cat,
    count: fights.filter((f) => f.weapon_category === cat).length,
  })).filter((c) => c.count > 0);
}

export function globalWinRate(fights: FightInput[]): string {
  const total = fights.length;
  const wins = fights.filter((f) => f.result === "win").length;
  return total === 0 ? "—" : `${Math.round((wins / total) * 100)}%`;
}

export function winRateByCategory(fights: FightInput[]): CategoryRate[] {
  return WEAPON_CATEGORIES.map((cat) => {
    const catFights = fights.filter((f) => f.weapon_category === cat);
    const catWins = catFights.filter((f) => f.result === "win").length;
    return {
      category: cat,
      total: catFights.length,
      rate: catFights.length === 0 ? "—" : `${Math.round((catWins / catFights.length) * 100)}%`,
    };
  }).filter((c) => c.total > 0);
}

export function topOpponents(fights: FightInput[]): OpponentCount[] {
  const opponentMap = new Map<string, number>();
  for (const fight of fights) {
    opponentMap.set(fight.opponent_name, (opponentMap.get(fight.opponent_name) ?? 0) + 1);
  }
  return [...opponentMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
}

export function gearItemCounts(
  fights: FightInput[],
  gearItems: GearItemInput[],
  compositions: CompositionInput[],
): NamedCount[] {
  const compositionsMap = new Map<string, string[]>();
  for (const comp of compositions) {
    const items = compositionsMap.get(comp.gear_set_id) ?? [];
    items.push(comp.gear_item_id);
    compositionsMap.set(comp.gear_set_id, items);
  }
  const gearItemCountMap = new Map<string, number>();
  for (const fight of fights) {
    if (fight.gear_set_id) {
      const itemIds = compositionsMap.get(fight.gear_set_id) ?? [];
      for (const itemId of itemIds) {
        gearItemCountMap.set(itemId, (gearItemCountMap.get(itemId) ?? 0) + 1);
      }
    }
  }
  return [...gearItemCountMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => {
      const item = gearItems.find((i) => i.id === id);
      return item ? { id, name: item.name, count } : null;
    })
    .filter((x): x is NamedCount => x !== null);
}

export function gearSetUsage(fights: FightInput[], gearSets: GearSetInput[]): NamedCount[] {
  const gearSetCountMap = new Map<string, number>();
  for (const fight of fights) {
    if (fight.gear_set_id) {
      gearSetCountMap.set(fight.gear_set_id, (gearSetCountMap.get(fight.gear_set_id) ?? 0) + 1);
    }
  }
  return [...gearSetCountMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => {
      const set = gearSets.find((s) => s.id === id);
      return set ? { id, name: set.name, count } : null;
    })
    .filter((x): x is NamedCount => x !== null);
}

export function computeStats(input: StatsInput): Stats {
  const { fights, gearSets, gearItems, compositions } = input;
  return {
    totalFights: totalFights(fights),
    fightCountByCategory: fightCountByCategory(fights),
    globalWinRate: globalWinRate(fights),
    winRateByCategory: winRateByCategory(fights),
    topOpponents: topOpponents(fights),
    gearItemCounts: gearItemCounts(fights, gearItems, compositions),
    gearSetUsage: gearSetUsage(fights, gearSets),
  };
}
