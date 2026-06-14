export const WEAPON_CATEGORIES = ["longsword", "sabre", "rapier", "other"] as const;
export type WeaponCategory = (typeof WEAPON_CATEGORIES)[number];

export const FIGHT_RESULTS = ["win", "loss", "draw"] as const;
export type FightResult = (typeof FIGHT_RESULTS)[number];
