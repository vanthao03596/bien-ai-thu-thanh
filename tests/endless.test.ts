import { describe, expect, it } from 'vitest'
import { hasAnim } from '../src/assets'
import {
  BASE_PROGRESSION, ENDLESS, TYPE_PROGRESSION, grow, growthMult, progressDef, progressionOf, type Growth,
} from '../src/data/endless'
import { ENEMIES, type EnemyType } from '../src/data/enemies'
import { LEVELS, type WaveDef } from '../src/data/levels'
import { SPEC_IDS } from '../src/data/towers'
import { EndlessDirector, tierOf } from '../src/sim/endless'
import { EARLY_CALL_GOLD_PER_SEC, World } from '../src/sim/world'
import { DT, run } from './field'

describe('growth', () => {
  it('multiplies once per wave and stops at its limit', () => {
    const g: Growth = { factor: 1.05, limit: 3 }
    expect(growthMult(g, 0)).toBe(1)
    expect(growthMult(g, 10)).toBeCloseTo(1.05 ** 10)
    expect(growthMult(g, 200)).toBe(3)
  })

  it('treats the limit of a shrinking number as a floor', () => {
    const g: Growth = { factor: 0.97, limit: 0.4 }
    expect(growthMult(g, 5)).toBeCloseTo(0.97 ** 5)
    expect(growthMult(g, 200)).toBe(0.4)
  })

  it('can step every few waves, or along a list of steps', () => {
    expect(growthMult({ factor: 2, cycle: 5 }, 14)).toBe(4)
    const steps: Growth = { factor: 1, cycle: 10, steps: [1, 1.5, 3] }
    expect([0, 10, 11, 20, 21, 99].map((n) => growthMult(steps, n))).toEqual([1, 1, 1.5, 1.5, 3, 3])
  })

  it('caps the final value when asked to', () => {
    const armor: Growth = { factor: 1.01, limitValue: 0.9 }
    expect(grow(armor, 0.65, 10)).toBeCloseTo(0.65 * 1.01 ** 10)
    expect(grow(armor, 0.65, 500)).toBe(0.9)
  })
})

describe('enemy progression', () => {
  it('leaves a type at its written strength in the wave it first appears', () => {
    for (const def of Object.values(ENEMIES)) {
      const grown = progressDef(def, 0, 12)
      expect({ ...grown, intro: '' }, def.type).toEqual({ ...def, intro: '', dmg: [...def.dmg] })
    }
  })

  it('raises hit points and damage and lowers the bounty, two curves against each other', () => {
    const a = progressDef(ENEMIES.orc, 5, 5)
    const b = progressDef(ENEMIES.orc, 15, 15)
    expect(a.hp).toBeGreaterThan(ENEMIES.orc.hp)
    expect(b.hp).toBeGreaterThan(a.hp)
    expect(b.dmg[1]).toBeGreaterThan(a.dmg[1])
    expect(b.gold).toBeLessThan(a.gold)
    expect(a.gold).toBeLessThanOrEqual(ENEMIES.orc.gold)
  })

  it('never pays more than the written bounty and never less than the floor', () => {
    const floor = BASE_PROGRESSION.gold.limit ?? 0
    for (const def of Object.values(ENEMIES)) {
      for (const n of [0, 1, 10, 40, 200]) {
        const gold = progressDef(def, n, n).gold
        expect(gold, `${def.type} +${n}`).toBeLessThanOrEqual(def.gold)
        expect(gold, `${def.type} +${n}`).toBeGreaterThanOrEqual(Math.floor(def.gold * floor))
      }
    }
  })

  it('stops the ordinary growth at its ceiling, then grows without one late in the run', () => {
    const cap = BASE_PROGRESSION.hp.limit ?? 0
    const megaFrom = BASE_PROGRESSION.megaHp.activeAfterWave ?? 0
    expect(megaFrom).toBeGreaterThan(20)
    expect(progressDef(ENEMIES.orc, megaFrom, megaFrom).hp).toBe(Math.round(ENEMIES.orc.hp * cap))
    const late = progressDef(ENEMIES.orc, megaFrom + 30, megaFrom + 30).hp
    expect(late).toBeGreaterThan(ENEMIES.orc.hp * cap * 4)
    expect(progressDef(ENEMIES.orc, megaFrom + 60, megaFrom + 60).hp).toBeGreaterThan(late * 4)
  })

  it('lets a type overrule the base curves', () => {
    expect(progressionOf('orc')).toEqual(BASE_PROGRESSION)
    expect(progressDef(ENEMIES.dark_knight, 20, 20).armor).toBeGreaterThan(ENEMIES.dark_knight.armor)
    expect(progressDef(ENEMIES.dark_knight, 300, 20).armor).toBe(0.9)
    expect(progressDef(ENEMIES.orc, 20, 20).armor).toBe(ENEMIES.orc.armor)
    // a boss comes back a clear step stronger, not a little stronger every wave
    expect(progressDef(ENEMIES.ogre_king, 9, 19).hp).toBe(ENEMIES.ogre_king.hp)
    expect(progressDef(ENEMIES.ogre_king, 11, 21).hp).toBeGreaterThan(ENEMIES.ogre_king.hp * 1.4)
    for (const type of Object.keys(TYPE_PROGRESSION)) expect(ENEMIES[type as EnemyType], type).toBeDefined()
  })
})

describe('the stock of waves', () => {
  it('has several tiers, each with ordinary waves and boss waves of enemies that exist', () => {
    expect(ENDLESS.tiers.length).toBeGreaterThanOrEqual(3)
    for (const tier of ENDLESS.tiers) {
      expect(tier.waves.length).toBeGreaterThanOrEqual(5)
      expect(tier.bossWaves.length).toBeGreaterThanOrEqual(1)
      for (const wave of [...tier.waves, ...tier.bossWaves]) {
        expect(wave.groups.length).toBeGreaterThan(0)
        for (const grp of wave.groups) {
          expect(ENEMIES[grp.type], grp.type).toBeDefined()
          expect(hasAnim(ENEMIES[grp.type].sheet, 'death')).toBe(true)
          expect(grp.count).toBeGreaterThan(0)
          expect(grp.gap).toBeGreaterThan(0)
        }
      }
    }
  })

  it('closes every tier with something big', () => {
    for (const tier of ENDLESS.tiers) {
      for (const wave of tier.bossWaves) {
        expect(wave.groups.some((grp) => ENEMIES[grp.type].lives >= 3)).toBe(true)
      }
    }
  })
})

function compose(seed: number, paths: number, count: number): WaveDef[] {
  const director = new EndlessDirector(seed, paths)
  return Array.from({ length: count }, (_, i) => director.next(i))
}

describe('the director', () => {
  it('always composes the same run of waves for the same map', () => {
    expect(compose(23, 2, 45)).toEqual(compose(23, 2, 45))
    expect(compose(23, 2, 45)).not.toEqual(compose(37, 2, 45))
  })

  it('has to be asked for the waves in order', () => {
    const director = new EndlessDirector(1, 1)
    director.next(0)
    expect(() => director.next(2)).toThrow()
  })

  it('sends the first wave down one road, and later waves down two now and then', () => {
    const waves = compose(23, 2, 40)
    const roads = (w: WaveDef): number => new Set(w.groups.map((grp) => grp.path)).size
    expect(roads(waves[0])).toBe(1)
    expect(waves.some((w) => roads(w) === 2)).toBe(true)
    expect(waves.some((w) => roads(w) === 1)).toBe(true)
    for (const w of compose(11, 1, 40)) expect(w.groups.every((grp) => grp.path === 0)).toBe(true)
  })

  it('ends every cycle with a boss wave and moves up a tier after it', () => {
    const cycle = ENDLESS.cycle
    expect(tierOf(0)).toBe(0)
    expect(tierOf(cycle - 1)).toBe(0)
    expect(tierOf(cycle)).toBe(1)
    expect(tierOf(cycle * 99)).toBe(ENDLESS.tiers.length - 1)
    const waves = compose(37, 2, cycle * 3)
    const types = (w: WaveDef): string => w.groups.map((grp) => grp.type).join()
    for (let c = 0; c < 3; c++) {
      const boss = types(waves[c * cycle + cycle - 1])
      expect(ENDLESS.tiers[c].bossWaves.map((w) => w.groups.map((grp) => grp.type).join())).toContain(boss)
    }
  })

  it('does not repeat a stock wave before the stock is used up', () => {
    const waves = compose(11, 1, 4)
    const types = waves.map((w) => w.groups.map((grp) => grp.type).join())
    expect(new Set(types).size).toBe(types.length)
  })

  it('adds enemies as a cycle goes on', () => {
    // the same stock wave early and late in a cycle
    const stock = ENDLESS.tiers[0].waves[0]
    const grp = stock.groups[0]
    expect(grp.grow).toBeGreaterThan(0)
    const counts: number[] = []
    for (let seed = 1; seed < 40; seed++) {
      compose(seed, 1, 5).forEach((w, pos) => {
        if (w.groups.length === stock.groups.length && w.groups[0].type === grp.type && w.groups.length === 1) {
          counts[pos] = w.groups[0].count
        }
      })
    }
    expect(counts[0]).toBe(grp.count)
    expect(counts[4]).toBe(grp.count + 4 * (grp.grow ?? 0))
  })
})

describe('an endless battle', () => {
  const level = LEVELS[1]

  it('starts with its own gold and lives and opens every branch', () => {
    const w = new World(level, 'normal', { mode: 'endless' })
    expect(w.endless).toBe(true)
    expect(w.gold).toBe(level.endless.gold)
    expect(w.lives).toBe(level.endless.lives)
    expect(w.waveCount).toBe(Infinity)
    expect(w.level.specs).toEqual(SPEC_IDS)
    expect(w.nextWaveGroups().length).toBeGreaterThan(0)
  })

  it('has no last wave: it only ends when the gate falls', () => {
    const w = new World({ ...level, endless: { gold: 0, lives: 3 } }, 'easy', { mode: 'endless' })
    w.callWave()
    for (let t = 0; t < 600 && w.result === null; t += DT) w.update(DT)
    expect(w.result).toBe('lose')
    expect(w.waveIndex).toBeGreaterThanOrEqual(0)
    expect(w.canCallWave()).toBe(false)
  })

  it('pays several times the campaign bonus for calling a wave early', () => {
    const w = new World(level, 'normal', { mode: 'endless' })
    w.callWave()
    run(w, 1)
    const left = w.waveTimer ?? 0
    expect(w.earlyBonus()).toBe(Math.floor(left * EARLY_CALL_GOLD_PER_SEC * ENDLESS.earlyCallBonus))
    const campaign = new World(level, 'normal')
    campaign.callWave()
    run(campaign, 1)
    expect(campaign.earlyBonus()).toBe(Math.floor((campaign.waveTimer ?? 0) * EARLY_CALL_GOLD_PER_SEC))
  })

  it('grows the enemies wave by wave, counted from the wave their type first showed up in', () => {
    const w = new World(level, 'hard', { mode: 'endless' })
    w.callWave()
    const first = w.spawnEnemy(ENEMIES.goblin, 0)
    expect(first.def.hp).toBe(ENEMIES.goblin.hp)
    for (let i = 0; i < 8; i++) w.callWave()
    const later = w.spawnEnemy(ENEMIES.goblin, 0)
    expect(later.def.hp).toBeGreaterThan(ENEMIES.goblin.hp)
    expect(later.hp).toBe(later.def.hp)
    expect(later.def.gold).toBeLessThanOrEqual(ENEMIES.goblin.gold)
    // a type that enters only now starts at its written strength
    const fresh = w.spawnEnemy(ENEMIES.demon_boss, 0)
    expect(fresh.def.hp).toBe(ENEMIES.demon_boss.hp)
  })

  it('scores new waves, kills and early calls, and nothing in other modes', () => {
    const w = new World(level, 'normal', { mode: 'endless' })
    expect(w.score).toBe(0)
    w.callWave()
    expect(w.score).toBe(0)
    const orc = w.spawnEnemy(ENEMIES.orc, 0, 100)
    w.damageEnemy(orc, 9999, 'true')
    const afterKill = w.score
    expect(afterKill).toBeGreaterThan(0)
    // armor and speed count for the score, unlike for the bounty
    const knight = w.spawnEnemy(ENEMIES.dark_knight, 0, 100)
    w.damageEnemy(knight, 9999, 'true')
    const s = ENDLESS.score
    const def = knight.def
    expect(w.score - afterKill).toBe(Math.round((1 + def.armor) * def.hp * s.perHp * (def.speed / s.speedRef)))
    run(w, 1)
    const before = w.score
    const left = w.waveTimer ?? 0
    const roads = new Set(w.nextWaveGroups().map((grp) => grp.path ?? 0)).size
    w.callWave()
    expect(w.score - before).toBe(s.perWave * 1 + Math.round(left * s.perSecondEarly * roads))

    const campaign = new World(level, 'normal')
    campaign.callWave()
    campaign.damageEnemy(campaign.spawnEnemy(ENEMIES.orc, 0, 100), 9999, 'true')
    expect(campaign.score).toBe(0)
  })
})
