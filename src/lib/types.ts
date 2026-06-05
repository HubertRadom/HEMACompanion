export interface GearItem {
  id: string;
  user_id: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
}

export interface GearSet {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface GearSetComposition {
  id: string;
  gear_set_id: string;
  gear_item_id: string;
  created_at: string;
}

export interface Fight {
  id: string;
  user_id: string;
  opponent_name: string;
  weapon_category: string;
  result: string;
  date: string;
  gear_set_id: string | null;
  created_at: string;
  updated_at: string;
}
