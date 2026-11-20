export type TowerType = 'archer' | 'mage' | 'artillery' | 'barracks'

export const TOWER_TYPES: readonly TowerType[] = ['archer', 'barracks', 'mage', 'artillery']

export const MAX_LEVEL = 2 // zero based: levels 0, 1, 2

/** Vertical squash of every range circle (the map is seen from above at an angle). */
export const RANGE_SQUASH = 0.75

export interface TowerDef {
  type: TowerType
  name: string
  blurb: string
  /** sheet key without the level suffix */
  sheetBase: string
  /** price of level 1, then the price of each upgrade */
  cost: readonly [number, number, number]
  range: readonly [number, number, number]
  /** seconds between shots (unused for barracks) */
  cooldown: readonly [number, number, number]
  dmg: readonly [readonly [number, number], readonly [number, number], readonly [number, number]]
  /** artillery: blast radius */
  splash: readonly [number, number, number]
  /** barracks: soldier hit points and armor */
  soldierHp: readonly [number, number, number]
  soldierArmor: readonly [number, number, number]
}

export const TOWERS: Record<TowerType, TowerDef> = {
  archer: {
    type: 'archer', name: 'Tháp cung', blurb: 'Bắn nhanh, tầm xa, hạ được quái bay.',
    sheetBase: 'towers/archer_tower',
    cost: [70, 110, 160],
    range: [130, 145, 160],
    cooldown: [0.8, 0.65, 0.5],
    dmg: [[4, 6], [7, 11], [11, 17]],
    splash: [0, 0, 0],
    soldierHp: [0, 0, 0],
    soldierArmor: [0, 0, 0],
  },
  mage: {
    type: 'mage', name: 'Tháp phép', blurb: 'Phép thuật xuyên giáp. Cấp 3 làm chậm.',
    sheetBase: 'towers/mage_tower',
    cost: [100, 160, 240],
    range: [112, 124, 138],
    cooldown: [1.5, 1.5, 1.4],
    dmg: [[12, 20], [24, 38], [42, 64]],
    splash: [0, 0, 0],
    soldierHp: [0, 0, 0],
    soldierArmor: [0, 0, 0],
  },
  artillery: {
    type: 'artillery', name: 'Tháp pháo', blurb: 'Nổ lan diện rộng, không bắn quái bay.',
    sheetBase: 'towers/artillery_tower',
    cost: [125, 220, 320],
    range: [120, 132, 146],
    cooldown: [3.0, 3.0, 2.8],
    dmg: [[10, 18], [22, 36], [40, 62]],
    splash: [34, 38, 44],
    soldierHp: [0, 0, 0],
    soldierArmor: [0, 0, 0],
  },
  barracks: {
    type: 'barracks', name: 'Doanh trại', blurb: 'Ba người lính chặn đường quái.',
    sheetBase: 'towers/barracks',
    cost: [70, 110, 160],
    range: [105, 105, 105],
    cooldown: [0, 0, 0],
    dmg: [[2, 4], [4, 7], [7, 12]],
    splash: [0, 0, 0],
    soldierHp: [50, 85, 130],
    soldierArmor: [0, 0.15, 0.3],
  },
}

export const SELL_REFUND = 0.6
export const SOLDIER_RESPAWN = 10
export const SOLDIERS_PER_BARRACKS = 3
export const MAGE_SLOW_FACTOR = 0.6
export const MAGE_SLOW_TIME = 1.5

export const HERO = {
  name: 'Thánh kỵ sĩ',
  sheet: 'heroes/hero_paladin',
  hp: 320,
  dmg: [12, 20] as const,
  armor: 0.4,
  atkCd: 1.0,
  speed: 62,
  respawn: 18,
  specialCd: 10,
  specialDmg: 45,
  specialRadius: 42,
  specialHeal: 0.15,
}

export const SPELLS = {
  fire: { name: 'Mưa lửa', cooldown: 50, count: 5, dmg: [45, 65] as const, radius: 30, scatter: 26 },
  reinforce: { name: 'Viện binh', cooldown: 22, count: 2, life: 18, hp: 60, dmg: [3, 6] as const },
}

export function towerSheet(type: TowerType, level: number): string {
  return `${TOWERS[type].sheetBase}_l${level + 1}`
}
