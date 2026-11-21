// Endless mode in two separate halves, both plain data: which wave comes next
// (a small stock of hand-written waves, sorted into tiers) and how much
// stronger the enemies have become by then (growth per wave).

import type { EnemyDef, EnemyType } from './enemies'

// ---------------------------------------------------------------- growth

/** One number that rises (or falls) with the waves since an enemy type first appeared. */
export interface Growth {
  factor: number
  /** waves per step, 1 when left out */
  cycle?: number
  base?: number
  /** ceiling of the multiplier when factor > 1, floor when factor < 1 */
  limit?: number
  /** ceiling or floor of the final value */
  limitValue?: number
  /** count from this wave on instead of from the first appearance */
  activeAfterWave?: number
  /** grow in steps instead: entry number ceil(waves / cycle) */
  steps?: readonly number[]
}

export function growthMult(g: Growth, waves: number): number {
  const cycle = g.cycle ?? 1
  if (g.steps && g.steps.length > 0) {
    const i = Math.min(g.steps.length, Math.max(1, Math.ceil(waves / cycle)))
    return g.steps[i - 1]
  }
  const m = (g.base ?? 1) * Math.pow(g.factor, Math.floor(waves / cycle))
  if (g.limit === undefined) return m
  return g.factor > 1 ? Math.min(m, g.limit) : Math.max(m, g.limit)
}

export function grow(g: Growth, raw: number, waves: number): number {
  const v = growthMult(g, waves) * raw
  if (g.limitValue === undefined) return v
  return g.factor < 1 ? Math.max(v, g.limitValue) : Math.min(v, g.limitValue)
}

export type GrownStat = 'hp' | 'dmg' | 'gold' | 'armor' | 'magicRes' | 'megaHp'
export type Progression = Record<GrownStat, Growth>

const STEADY: Growth = { factor: 1 }

/**
 * Two curves that run against each other: hit points and damage go up, the
 * bounty goes down, and that alone tightens the game wave after wave. megaHp
 * has no ceiling, so every run ends sooner or later.
 */
export const BASE_PROGRESSION: Progression = {
  hp: { factor: 1.05, limit: 3 },
  dmg: { factor: 1.04, limit: 2.5 },
  gold: { factor: 0.97, limit: 0.4 },
  armor: STEADY,
  magicRes: STEADY,
  megaHp: { factor: 1.05, activeAfterWave: 40 },
}

/** What some enemy types do differently; everything left out follows the base. */
export const TYPE_PROGRESSION: Partial<Record<EnemyType, Partial<Progression>>> = {
  // nearly immune to arrows already: they grow slower, or nothing but magic would matter
  ghost_wolf: { hp: { factor: 1.04, limit: 2.5 } },
  bat: { hp: { factor: 1.04, limit: 3 } },
  dark_knight: { armor: { factor: 1.01, limitValue: 0.9 } },
  shaman: { magicRes: { factor: 1.015, limitValue: 0.85 } },
  hexer: { magicRes: { factor: 1.015, limitValue: 0.85 } },
  // the bosses return every few cycles, each time a clear step up
  ogre_king: { hp: { factor: 1, cycle: 10, steps: [1, 1.5, 2.2, 3.2, 4.5, 6] } },
  demon_boss: { hp: { factor: 1, cycle: 10, steps: [1, 1.4, 2, 2.9, 4, 5.5] } },
}

export function progressionOf(type: EnemyType): Progression {
  return { ...BASE_PROGRESSION, ...TYPE_PROGRESSION[type] }
}

/**
 * The enemy as it enters the field in wave `wave` (zero based), `since` waves
 * after its type first appeared. A type that is new to the field always comes
 * at its written strength, so the player meets it before it has grown.
 */
export function progressDef(def: EnemyDef, since: number, wave: number): EnemyDef {
  const p = progressionOf(def.type)
  const n = Math.max(0, since)
  let hp = grow(p.hp, def.hp, n)
  const megaFrom = p.megaHp.activeAfterWave ?? 0
  if (wave > megaFrom) hp = grow(p.megaHp, hp, wave - megaFrom)
  const dmg = growthMult(p.dmg, n)
  // a bounty never grows past what is written
  const gold = Math.min(def.gold, Math.max(0, Math.round(grow(p.gold, def.gold, n))))
  return {
    ...def,
    hp: Math.max(1, Math.round(hp)),
    dmg: [Math.round(def.dmg[0] * dmg), Math.round(def.dmg[1] * dmg)],
    gold: def.gold > 0 ? Math.max(1, gold) : 0,
    armor: Math.min(1, grow(p.armor, def.armor, n)),
    magicRes: Math.min(1, grow(p.magicRes, def.magicRes, n)),
  }
}

// ---------------------------------------------------------------- waves

/** One batch of a stock wave. */
export interface EndlessGroup {
  type: EnemyType
  count: number
  gap: number
  at: number
  /** walks the other road when the wave comes down two roads at once */
  alt?: boolean
  /** enemies added every `every` waves into a cycle (`every` is 1 when left out) */
  grow?: number
  every?: number
}

export interface EndlessWave {
  groups: readonly EndlessGroup[]
}

export interface EndlessTier {
  waves: readonly EndlessWave[]
  /** closes every cycle */
  bossWaves: readonly EndlessWave[]
  /** chance that a wave uses two roads: [at the start of a cycle, added per wave into it] */
  splitChance: readonly [number, number]
}

interface GroupOpts {
  alt?: boolean
  grow?: number
  every?: number
}

function e(type: EnemyType, count: number, gap: number, at = 0, opts: GroupOpts = {}): EndlessGroup {
  return { type, count, gap, at, ...opts }
}

const ALT = { alt: true } as const

const TIERS: readonly EndlessTier[] = [
  {
    splitChance: [0.1, 0.05],
    waves: [
      { groups: [e('goblin', 10, 0.8, 0, { grow: 2 })] },
      { groups: [e('goblin', 8, 0.9, 0, { grow: 1 }), e('wolf', 4, 1.1, 6, { alt: true, grow: 1, every: 2 })] },
      { groups: [e('skeleton', 6, 1.4, 0, { grow: 1, every: 2 }), e('goblin', 8, 0.7, 4, { alt: true, grow: 1 })] },
      { groups: [e('orc', 4, 2.0, 0, { grow: 1, every: 2 }), e('goblin_archer', 3, 1.4, 6, { alt: true, grow: 1, every: 3 })] },
      { groups: [e('bat', 7, 1.0, 0, { grow: 1 }), e('skeleton', 5, 1.3, 3, { alt: true, grow: 1, every: 2 })] },
      { groups: [e('wolf', 6, 0.9, 0, { grow: 1 }), e('orc', 3, 2.0, 4, { grow: 1, every: 3 }), e('bat', 5, 1.0, 8, { alt: true, grow: 1, every: 2 })] },
    ],
    bossWaves: [
      { groups: [e('ogre', 1, 1), e('orc', 6, 1.6, 2), e('goblin', 16, 0.5, 6, ALT), e('wolf', 8, 0.8, 14, ALT)] },
      { groups: [e('ogre', 2, 9), e('skeleton', 10, 1.0, 3, ALT), e('bat', 8, 0.9, 10)] },
    ],
  },
  {
    splitChance: [0.3, 0.05],
    waves: [
      { groups: [e('dark_knight', 3, 4, 0, { grow: 1, every: 3 }), e('goblin', 14, 0.45, 2, { alt: true, grow: 2 })] },
      { groups: [e('shaman', 2, 5, 3), e('skeleton', 10, 1.0, 0, { grow: 1 }), e('wolf', 7, 0.7, 6, { alt: true, grow: 1 })] },
      { groups: [e('berserker', 4, 2.2, 0, { grow: 1, every: 2 }), e('bat', 9, 0.9, 5, { alt: true, grow: 1 })] },
      { groups: [e('orc', 8, 1.4, 0, { grow: 1 }), e('ghost_wolf', 4, 1.4, 4, { alt: true, grow: 1, every: 2 }), e('goblin_archer', 5, 1.0, 8, { grow: 1, every: 2 })] },
      { groups: [e('ogre', 1, 7, 0, { grow: 1, every: 5 }), e('orc', 6, 1.3, 2, { alt: true, grow: 1 }), e('shaman', 1, 1, 6, ALT)] },
      { groups: [e('bat', 12, 0.7, 0, { grow: 1 }), e('brood_bat', 1, 5, 8, { alt: true, grow: 1, every: 4 }), e('skeleton', 8, 0.9, 3, { grow: 1 })] },
    ],
    bossWaves: [
      { groups: [e('ogre_king', 1, 1, 6), e('orc', 10, 1.0, 2, ALT), e('dark_knight', 3, 3, 12), e('bat', 10, 0.6, 18, ALT)] },
      { groups: [e('ogre', 3, 6), e('troll', 1, 1, 10, ALT), e('berserker', 5, 1.8, 4, ALT), e('shaman', 2, 4, 8)] },
    ],
  },
  {
    splitChance: [0.5, 0.05],
    waves: [
      { groups: [e('troll', 2, 8, 0, { grow: 1, every: 4 }), e('wolf', 12, 0.5, 2, { alt: true, grow: 1 }), e('ghost_wolf', 3, 1.4, 10, { alt: true, grow: 1, every: 3 })] },
      { groups: [e('skeleton', 10, 0.8, 0, { grow: 1 }), e('dark_knight', 4, 3.2, 2, { grow: 1, every: 3 }), e('necromancer', 1, 7, 5, { alt: true, grow: 1, every: 4 })] },
      { groups: [e('hexer', 2, 5, 4, { grow: 1, every: 4 }), e('dark_knight', 4, 3, 2, ALT), e('goblin', 20, 0.4, 8, { grow: 2 })] },
      { groups: [e('orc', 10, 1.0, 0, { alt: true, grow: 1 }), e('berserker', 4, 1.9, 6, { grow: 1, every: 2 }), e('warchief', 1, 1, 9, ALT), e('shaman', 2, 3, 10)] },
      { groups: [e('ogre', 2, 6, 0, { grow: 1, every: 4 }), e('troll', 1, 1, 12, ALT), e('orc', 8, 1.0, 2, { alt: true, grow: 1 }), e('goblin_archer', 6, 0.8, 8, { grow: 1 })] },
      { groups: [e('bat', 12, 0.55, 0, { grow: 2 }), e('brood_bat', 2, 4, 8, { alt: true, grow: 1, every: 4 }), e('ghost_wolf', 4, 1.2, 12, { grow: 1, every: 2 }), e('skeleton', 12, 0.8, 4, { alt: true, grow: 1 })] },
    ],
    bossWaves: [
      { groups: [e('demon_boss', 1, 1, 4), e('orc', 12, 1.2, 0, ALT), e('skeleton', 14, 1.0, 10), e('dark_knight', 4, 3.5, 14, ALT), e('hexer', 1, 1, 26)] },
      { groups: [e('ogre_king', 1, 1, 6, ALT), e('ogre', 2, 7), e('necromancer', 2, 6, 8, ALT), e('wolf', 16, 0.45, 12), e('warchief', 1, 1, 20)] },
    ],
  },
  {
    splitChance: [0.7, 0.03],
    waves: [
      { groups: [e('dark_knight', 6, 2.5, 0, { grow: 1, every: 2 }), e('shaman', 2, 3, 6), e('warchief', 1, 1, 9, ALT), e('wolf', 16, 0.45, 12, { alt: true, grow: 2 })] },
      { groups: [e('ogre', 3, 5, 0, { grow: 1, every: 3 }), e('troll', 2, 6, 8, { alt: true, grow: 1, every: 4 }), e('goblin', 22, 0.35, 8, { grow: 2 }), e('goblin_archer', 8, 0.7, 12, { alt: true, grow: 1 })] },
      { groups: [e('skeleton', 14, 0.8, 0, { alt: true, grow: 2 }), e('berserker', 5, 1.8, 6, { grow: 1, every: 2 }), e('necromancer', 2, 6, 8, { alt: true, grow: 1, every: 4 }), e('hexer', 2, 4, 9)] },
      { groups: [e('orc', 12, 0.9, 0, { grow: 1 }), e('bat', 14, 0.5, 0, { alt: true, grow: 2 }), e('ghost_wolf', 6, 1.1, 6, { grow: 1, every: 2 }), e('brood_bat', 2, 3, 10, { alt: true, grow: 1, every: 3 })] },
      {
        groups: [
          e('ogre', 2, 6), e('dark_knight', 5, 2.5, 4, { alt: true, grow: 1, every: 3 }), e('troll', 1, 6, 10, { grow: 1, every: 5 }),
          e('berserker', 4, 1.8, 11, { grow: 1, every: 2 }), e('warchief', 1, 1, 14, ALT), e('bat', 10, 0.6, 16, { grow: 1 }),
        ],
      },
    ],
    bossWaves: [
      {
        groups: [
          e('demon_boss', 1, 1, 4), e('orc', 12, 1.0, 0, ALT), e('dark_knight', 5, 3, 10), e('ogre_king', 1, 1, 14, ALT),
          e('warchief', 1, 1, 20, ALT), e('hexer', 2, 5, 24), e('bat', 16, 0.6, 30),
        ],
      },
      {
        groups: [
          e('demon_boss', 1, 1, 6, ALT), e('ogre', 4, 5), e('necromancer', 2, 6, 10), e('troll', 2, 7, 12, ALT),
          e('goblin', 24, 0.4, 20), e('brood_bat', 2, 3, 26, ALT),
        ],
      },
    ],
  },
]

export const ENDLESS = {
  /** waves per cycle; the last one of every cycle is a boss wave, and the tier rises after it */
  cycle: 10,
  tiers: TIERS,
  /**
   * Chance of borrowing a wave from the next tier, for the waves of the second
   * half of a cycle (the boss wave aside). Every borrowed wave halves the
   * chance for the rest of the cycle: the pressure builds toward the end
   * without two spikes in a row.
   */
  peekChance: [0, 0.12, 0.2, 0.3] as const,
  /** calling early pays this many times the campaign bonus: endless wants to be played fast */
  earlyCallBonus: 3.5,
  score: {
    /** points for starting wave n: this times n - 1 */
    perWave: 100,
    /** points for a kill per hit point, scaled by its protection and its speed */
    perHp: 0.25,
    /** the walking speed a kill is worth exactly its hit points at */
    speedRef: 30,
    /** points per second left on the clock when a wave is called early, per road it uses */
    perSecondEarly: 2,
  },
} as const
