export const GEAR_CATEGORIES = [
  "Longsword",
  "Sabre",
  "Rapier",
  "Messer",
  "Sidesword",
  "Dagger",
  "Sword & Buckler",
  "Poleaxe",
  "Other",
] as const;

export type GearCategory = (typeof GEAR_CATEGORIES)[number];
