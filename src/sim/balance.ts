// Balance metrics computed from the game data. Nothing here runs during a
// battle: the tests use these numbers to hold the data to its own rules, and
// `npm run balance` prints them as tables.

import { DIFFICULTIES, type Difficulty } from '../data/difficulty'
import { abilityOf, enemiesFor, type EnemyDef, type EnemyType } from '../data/enemies'
import type { LevelDef } from '../data/levels'
import {
  SOLDIERS_PER_BARRACKS, SOLDIER_ATK_CD, SPECS, SPEC_IDS, TOWERS, TOWER_TYPES, type TowerType,
} from '../data/towers'
import type { DamageKind } from './types'

// ---------------------------------------------------------------- towers

export interface TowerRow {
  /** "archer 1" to "archer 3", then the id of a specialisation */
  id: string
  type: TowerType
  /** 1 to 3, or 4 for a specialisation */
  tier: number
  /** gold paid in total to stand at this tier */
  spent: number
  kind: DamageKind
  /** damage per second on one target, before armor and without skills */
  dps: number
  /** dps bought by 100 gold */
  per100: number
}

function row(id: string, type: TowerType, tier: number, spent: number, dmg: readonly [number, number], cooldown: number): TowerRow {
  const hits = type === 'barracks' ? SOLDIERS_PER_BARRACKS : 1
  const dps = (((dmg[0] + dmg[1]) / 2) * hits) / cooldown
  return { id, type, tier, spent, kind: TOWERS[type].dmgKind, dps, per100: (dps / spent) * 100 }
}

/** Every tier of every tower. A barracks counts all its soldiers swinging at once, which they rarely do. */
export function towerTable(): TowerRow[] {
  const rows: TowerRow[] = []
  for (const type of TOWER_TYPES) {
    const def = TOWERS[type]
    let spent = 0
    def.cost.forEach((cost, level) => {
      spent += cost
      rows.push(row(`${type} ${level + 1}`, type, level + 1, spent, def.dmg[level], type === 'barracks' ? SOLDIER_ATK_CD : def.cooldown[level]))
    })
    for (const id of SPEC_IDS) {
      const spec = SPECS[id]
      if (spec.base !== type) continue
      rows.push(row(id, type, 4, spent + spec.cost, spec.dmg, type === 'barracks' ? spec.soldierAtkCd : spec.cooldown))
    }
  }
  return rows
}

/**
 * The gold efficiency every tower is held to, in single-target dps per 100 gold.
 * Shooters that hit one target stay inside a narrow band at every level, so no
 * tower is simply the better buy: what sets them apart is the kind of damage.
 * An upgrade may cost a little efficiency (it saves a plot), and the fourth
 * tier costs more of it: its price buys skills, not raw damage. Artillery
 * trades most of its single-target damage for the blast.
 */
export const DPS_RULES = {
  /** archer and mage, level 1 to 3 */
  shooter: [7.5, 9] as const,
  /** their specialisations */
  shooterSpec: [5, 7.5] as const,
  /** artillery of any tier, as a fraction of the shooters of the same tier */
  artilleryShare: [0.25, 0.5] as const,
}

// ---------------------------------------------------------------- bounties

export interface BountyBand {
  /** the band covers enemies below this many hit points */
  below: number
  /** allowed hit points per gold coin */
  hpPerGold: readonly [number, number]
}

/**
 * Bounties follow the hit points on the hardest difficulty and nothing else.
 * Armor, resistance, wings and abilities pay no extra: countering those is a
 * matter of the right tower, not of more gold. Bigger enemies pay less per hit
 * point, which tightens the economy as a level goes on.
 */
export const BOUNTY_BANDS: readonly BountyBand[] = [
  { below: 120, hpPerGold: [6.3, 8.5] },
  { below: 420, hpPerGold: [9.5, 11.5] },
  { below: Infinity, hpPerGold: [14.5, 16] },
]

export function bountyBand(hp: number): BountyBand {
  return BOUNTY_BANDS.find((b) => hp < b.below) ?? BOUNTY_BANDS[BOUNTY_BANDS.length - 1]
}

// ---------------------------------------------------------------- levels

export interface WaveBudget {
  enemies: number
  hp: number
  gold: number
  /** seconds from the first to the last spawn */
  duration: number
}

export interface LevelBudget {
  id: string
  difficulty: Difficulty
  startGold: number
  waves: WaveBudget[]
  enemies: number
  hp: number
  /** bounties of every enemy in the waves */
  bounty: number
  /** hit points the player has to remove per gold coin there is to spend: the plainest measure of difficulty */
  hpPerGold: number
}

/** Hit points and bounty of one enemy, with whatever bursts out of it when it dies. */
function worth(defs: Record<EnemyType, EnemyDef>, def: EnemyDef): { enemies: number; hp: number; gold: number } {
  const total = { enemies: 1, hp: def.hp, gold: def.gold }
  const split = abilityOf(def, 'split')
  if (split) {
    const child = worth(defs, defs[split.type])
    total.enemies += child.enemies * split.count
    total.hp += child.hp * split.count
    total.gold += child.gold * split.count
  }
  return total
}

/**
 * What a level asks for and what it pays. Enemies raised by a summoner are
 * left out: they pay nothing and only appear when the summoner is left alive.
 */
export function levelBudget(level: LevelDef, difficulty: Difficulty = 'hard'): LevelBudget {
  const defs = enemiesFor(difficulty)
  const waves = level.waves.map((wave) => {
    const w: WaveBudget = { enemies: 0, hp: 0, gold: 0, duration: 0 }
    for (const grp of wave.groups) {
      const one = worth(defs, defs[grp.type])
      w.enemies += one.enemies * grp.count
      w.hp += one.hp * grp.count
      w.gold += one.gold * grp.count
      w.duration = Math.max(w.duration, grp.at + (grp.count - 1) * grp.gap)
    }
    return w
  })
  const sum = (pick: (w: WaveBudget) => number): number => waves.reduce((n, w) => n + pick(w), 0)
  const hp = sum((w) => w.hp)
  const bounty = sum((w) => w.gold)
  return {
    id: level.id,
    difficulty,
    startGold: level.startGold,
    waves,
    enemies: sum((w) => w.enemies),
    hp,
    bounty,
    hpPerGold: hp / (level.startGold + bounty),
  }
}

// ---------------------------------------------------------------- report

function table(head: string[], rows: (string | number)[][]): string {
  const cells = [head, ...rows.map((r) => r.map((c) => (typeof c === 'number' ? (Number.isInteger(c) ? String(c) : c.toFixed(1)) : c)))]
  const widths = head.map((_, i) => Math.max(...cells.map((r) => r[i].length)))
  return cells.map((r) => r.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ')).join('\n')
}

/** The balance tables as plain text. */
export function balanceReport(levels: readonly LevelDef[]): string {
  const towers = table(
    ['tower', 'spent', 'kind', 'dps', 'dps/100 gold'],
    towerTable().map((r) => [r.id, r.spent, r.kind, r.dps, r.per100]),
  )
  const hard = enemiesFor('hard')
  const bounties = table(
    ['enemy', ...DIFFICULTIES.map((d) => `hp ${d}`), 'armor', 'resist', 'gold', 'hp/gold', 'band'],
    Object.values(hard).map((def) => {
      const band = bountyBand(def.hp).hpPerGold
      return [
        def.type, ...DIFFICULTIES.map((d) => enemiesFor(d)[def.type].hp), def.armor.toFixed(2), def.magicRes.toFixed(2), def.gold, def.hp / def.gold, `${band[0]}-${band[1]}`,
      ]
    }),
  )
  const budgets = table(
    ['level', 'difficulty', 'start gold', 'waves', 'enemies', 'bounty', 'hp', 'hp/gold', 'first wave hp', 'last wave hp'],
    levels.flatMap((level) =>
      DIFFICULTIES.map((d) => {
        const b = levelBudget(level, d)
        return [b.id, d, b.startGold, b.waves.length, b.enemies, b.bounty, b.hp, b.hpPerGold.toFixed(2), b.waves[0].hp, b.waves[b.waves.length - 1].hp]
      }),
    ),
  )
  return ['TOWERS', towers, '', 'BOUNTIES', bounties, '', 'LEVELS', budgets].join('\n')
}
