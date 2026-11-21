import { beforeAll, describe, expect, it } from 'vitest'
import { DIFFICULTIES, DIFFICULTY, type Difficulty } from '../src/data/difficulty'
import { ENEMIES, abilityOf, enemiesFor, type EnemyDef } from '../src/data/enemies'
import { LEVELS, type LevelDef } from '../src/data/levels'
import { MAX_SKILL_RANK, SKILLS, TOWERS, type SkillId } from '../src/data/towers'
import { DPS_RULES, balanceReport, bountyBand, levelBudget, towerTable, type TowerRow } from '../src/sim/balance'
import { BUILD_ORDER, Bot } from '../src/sim/bot'
import { World } from '../src/sim/world'
import { parseSave } from '../src/save'

const DT = 1 / 60

function within(value: number, band: readonly [number, number], what: string): void {
  expect(value, what).toBeGreaterThanOrEqual(band[0])
  expect(value, what).toBeLessThanOrEqual(band[1])
}

describe('tower efficiency', () => {
  const rows = towerTable()
  const pick = (type: string, tier: number): TowerRow[] => rows.filter((r) => r.type === type && r.tier === tier)
  const mean = (list: TowerRow[]): number => list.reduce((n, r) => n + r.per100, 0) / list.length

  it('single-target shooters buy about the same damage per gold at every level', () => {
    for (const r of rows) {
      if ((r.type === 'archer' || r.type === 'mage') && r.tier <= 3) within(r.per100, DPS_RULES.shooter, r.id)
    }
  })

  it('an upgrade saves a plot and never pays better than a fresh tower', () => {
    for (const type of ['archer', 'mage', 'artillery']) {
      const first = pick(type, 1)[0].per100
      for (const tier of [2, 3, 4]) for (const r of pick(type, tier)) expect(r.per100, r.id).toBeLessThanOrEqual(first)
    }
  })

  it('the fourth tier sells skills, not raw damage', () => {
    for (const r of rows) {
      if ((r.type === 'archer' || r.type === 'mage') && r.tier === 4) within(r.per100, DPS_RULES.shooterSpec, r.id)
    }
  })

  it('artillery trades most of its single-target damage for the blast', () => {
    for (const tier of [1, 2, 3, 4]) {
      const shooters = mean([...pick('archer', tier), ...pick('mage', tier)])
      for (const r of pick('artillery', tier)) within(r.per100 / shooters, DPS_RULES.artilleryShare, r.id)
    }
  })

  it('prices rise by about half again with every level', () => {
    for (const def of Object.values(TOWERS)) {
      for (const level of [1, 2]) within(def.cost[level] / def.cost[level - 1], [1.4, 1.8], `${def.type} ${level + 1}`)
    }
  })
})

describe('skills', () => {
  const ids = Object.keys(SKILLS) as SkillId[]

  it('cost a base price for the first rank and the same step for every further one', () => {
    for (const id of ids) {
      const cost = SKILLS[id].cost
      expect(cost, id).toHaveLength(MAX_SKILL_RANK)
      expect(cost[2], id).toBe(cost[1])
      expect(cost[1], id).toBeLessThanOrEqual(cost[0])
    }
  })

  it('grow along one axis only, a little more with every rank', () => {
    for (const id of ids) {
      const growing = Object.entries(SKILLS[id]).filter(([key, v]) => key !== 'cost' && Array.isArray(v))
      expect(growing.map(([key]) => key), id).toHaveLength(1)
      const values = growing[0][1] as readonly number[]
      expect(values, id).toHaveLength(MAX_SKILL_RANK)
      for (let rank = 1; rank < values.length; rank++) expect(values[rank], id).toBeGreaterThan(values[rank - 1])
    }
  })
})

describe('bounties', () => {
  it('follow the hit points alone: armor, resistance and abilities pay no extra', () => {
    for (const def of Object.values<EnemyDef>(ENEMIES)) within(def.hp / def.gold, bountyBand(def.hp).hpPerGold, def.type)
  })

  it('pay less per hit point the bigger the enemy', () => {
    const perHp = (def: EnemyDef): number => def.gold / def.hp
    expect(perHp(ENEMIES.goblin)).toBeGreaterThan(perHp(ENEMIES.dark_knight))
    expect(perHp(ENEMIES.dark_knight)).toBeGreaterThan(perHp(ENEMIES.ogre))
  })

  it('charge more lives for bigger enemies and everything for the last boss', () => {
    expect(ENEMIES.goblin.lives).toBe(1)
    expect(ENEMIES.ogre.lives).toBeGreaterThan(ENEMIES.dark_knight.lives)
    for (const level of LEVELS) expect(ENEMIES.demon_boss.lives).toBeGreaterThanOrEqual(level.lives)
  })
})

describe('difficulty', () => {
  it('is written for the hardest setting and only scaled down from there', () => {
    expect(enemiesFor('hard')).toBe(ENEMIES)
    expect(DIFFICULTY.hard.hp).toBe(1)
    expect(DIFFICULTY.easy.hp).toBeLessThan(DIFFICULTY.normal.hp)
    expect(DIFFICULTY.normal.hp).toBeLessThan(DIFFICULTY.hard.hp)
  })

  it('changes the hit points of the enemies and nothing about gold, speed or damage', () => {
    for (const d of DIFFICULTIES) {
      const table = enemiesFor(d)
      for (const def of Object.values<EnemyDef>(ENEMIES)) {
        const eased = table[def.type]
        if (!def.eased) expect(eased.hp, `${d} ${def.type}`).toBe(Math.round(def.hp * DIFFICULTY[d].hp))
        expect({ ...eased, hp: 0 }, `${d} ${def.type}`).toEqual({ ...def, hp: 0 })
      }
    }
  })

  it('lets a hand-set value replace the factor', () => {
    const boss = ENEMIES.demon_boss.eased?.hp
    if (!boss) throw new Error('the boss has no hand-set hit points')
    expect(enemiesFor('easy').demon_boss.hp).toBe(boss[0])
    expect(enemiesFor('normal').demon_boss.hp).toBe(boss[1])
    expect(boss[0]).toBeLessThan(boss[1])
    expect(boss[1]).toBeLessThan(ENEMIES.demon_boss.hp)
  })

  it('is baked into everything a battle spawns, raised and split enemies included', () => {
    const w = new World(LEVELS[2], 'easy')
    const easy = enemiesFor('easy')
    const brood = w.spawnEnemy(ENEMIES.brood_bat, 0, 200)
    expect(brood.def).toBe(easy.brood_bat)
    expect(brood.hp).toBe(easy.brood_bat.hp)
    w.damageEnemy(brood, 9999, 'true')
    const split = abilityOf(ENEMIES.brood_bat, 'split')
    const bats = w.enemies.filter((e) => e.def.type === 'bat')
    expect(bats).toHaveLength(split?.count ?? -1)
    for (const bat of bats) expect(bat.hp).toBe(easy.bat.hp)
    w.callWave()
    for (let i = 0; i < 120; i++) w.update(DT)
    expect(w.enemies.filter((e) => e.def.type === 'goblin').every((e) => e.def === easy.goblin)).toBe(true)
  })

  it('reads old saves as wins on normal and keeps the stars of every setting apart', () => {
    const old = parseSave({ stars: { meadow: 3, creek: 9 }, muted: true, tips: ['build'] })
    expect(old.stars).toEqual({ easy: {}, normal: { meadow: 3 }, hard: {} })
    expect(old.difficulty).toBe('normal')
    expect(old.muted).toBe(true)
    const now = parseSave({ stars: { easy: { meadow: 3 }, normal: {}, hard: { meadow: 1 } }, difficulty: 'hard' })
    expect(now.stars).toEqual({ easy: { meadow: 3 }, normal: {}, hard: { meadow: 1 } })
    expect(now.difficulty).toBe('hard')
    expect(parseSave('rubbish').stars).toEqual({ easy: {}, normal: {}, hard: {} })
  })
})

describe('level budgets', () => {
  it('ask for more hit points per gold coin with every level, on every difficulty', () => {
    for (const d of DIFFICULTIES) {
      const budgets = LEVELS.map((level) => levelBudget(level, d))
      for (let i = 1; i < budgets.length; i++) {
        expect(budgets[i].hpPerGold, `${d} ${budgets[i].id}`).toBeGreaterThan(budgets[i - 1].hpPerGold * 1.05)
      }
    }
  })

  it('hand out a little more gold to start with as the campaign goes on', () => {
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i].startGold).toBeGreaterThan(LEVELS[i - 1].startGold)
  })

  it('build up to the last wave, which is several times the first', () => {
    for (const level of LEVELS) {
      const waves = levelBudget(level).waves
      const last = waves[waves.length - 1].hp
      expect(last, level.id).toBe(Math.max(...waves.map((w) => w.hp)))
      expect(last / waves[0].hp, level.id).toBeGreaterThanOrEqual(5)
    }
  })

  it('count what bursts out of an enemy, but not what a summoner may raise', () => {
    const level: LevelDef = { ...LEVELS[0], waves: [{ groups: [{ type: 'brood_bat', count: 2, gap: 1, at: 0 }, { type: 'necromancer', count: 1, gap: 1, at: 3 }] }] }
    const b = levelBudget(level)
    expect(b.enemies).toBe(2 * 4 + 1)
    expect(b.hp).toBe(2 * (ENEMIES.brood_bat.hp + 3 * ENEMIES.bat.hp) + ENEMIES.necromancer.hp)
    expect(b.bounty).toBe(2 * (ENEMIES.brood_bat.gold + 3 * ENEMIES.bat.gold) + ENEMIES.necromancer.gold)
    expect(b.waves[0].duration).toBe(3)
  })
})

// ---------------------------------------------------------------- played by bots

/** Lives a bot gives away over a whole level when it cannot run out of them. */
function leaked(level: LevelDef, difficulty: Difficulty, bot: number): number {
  const plenty = 999
  const w = new World({ ...level, lives: plenty }, difficulty)
  const order = [...BUILD_ORDER.slice(bot), ...BUILD_ORDER.slice(0, bot)]
  const player = new Bot(w, { order })
  for (let t = 0; t < 1500 && w.result === null; t += DT) {
    player.update(DT)
    w.update(DT)
  }
  return w.result === 'win' ? plenty - w.lives : plenty
}

/** Four simple players that differ in what they build first: no single lucky or unlucky run decides. */
const PANEL = [0, 1, 2, 3]

describe('played by a panel of simple bots', { timeout: 120_000 }, () => {
  const runs = new Map<string, number[]>()
  const of = (level: number, d: Difficulty): number[] => runs.get(`${level}:${d}`) ?? []
  const sum = (list: number[]): number => list.reduce((a, b) => a + b, 0)

  beforeAll(() => {
    LEVELS.forEach((level, i) => {
      for (const d of DIFFICULTIES) runs.set(`${i}:${d}`, PANEL.map((bot) => leaked(level, d, bot)))
    })
    if (import.meta.env.VITE_BALANCE_REPORT) {
      const lines = LEVELS.flatMap((level, i) => DIFFICULTIES.map((d) => `${level.id.padEnd(9)} ${d.padEnd(7)} ${of(i, d).join('  ')}`))
      console.log([balanceReport(LEVELS), '', `LIVES GIVEN AWAY BY ${PANEL.length} BOTS (a level has 20)`, ...lines].join('\n'))
    }
  })

  it('an undefended kingdom falls on every level, even on easy', () => {
    for (const level of LEVELS) {
      const w = new World(level, 'easy')
      w.callWave()
      for (let t = 0; t < 1500 && w.result === null; t += DT) w.update(DT)
      expect(w.result, level.id).toBe('lose')
    }
  })

  it('the first level is cleared almost untouched on normal, and can be won on hard', () => {
    for (const lost of of(0, 'normal')) expect(lost).toBeLessThanOrEqual(5)
    for (const lost of of(0, 'hard')) expect(lost).toBeLessThan(LEVELS[0].lives)
  })

  it('the later levels can still be won on normal, but never for free', () => {
    for (const i of [1, 2]) {
      const lost = of(i, 'normal')
      expect(lost.filter((n) => n < LEVELS[i].lives).length, LEVELS[i].id).toBeGreaterThanOrEqual(PANEL.length / 2)
      expect(Math.min(...lost), LEVELS[i].id).toBeGreaterThan(0)
    }
  })

  it('easy forgives and hard punishes the same play', () => {
    for (const i of [1, 2]) {
      expect(sum(of(i, 'easy')), LEVELS[i].id).toBeLessThan(sum(of(i, 'normal')))
      expect(sum(of(i, 'normal')), LEVELS[i].id).toBeLessThan(sum(of(i, 'hard')))
      expect(of(i, 'easy').filter((n) => n < LEVELS[i].lives).length, LEVELS[i].id).toBeGreaterThanOrEqual(of(i, 'normal').filter((n) => n < LEVELS[i].lives).length)
    }
  })

  it('is deterministic for a given level, difficulty and bot', () => {
    expect(leaked(LEVELS[0], 'normal', 0)).toBe(of(0, 'normal')[0])
  })
})
