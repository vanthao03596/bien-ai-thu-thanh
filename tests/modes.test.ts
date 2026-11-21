import { describe, expect, it } from 'vitest'
import type { Sfx } from '../src/audio'
import { DIFFICULTIES } from '../src/data/difficulty'
import { ENEMIES } from '../src/data/enemies'
import { LEVELS } from '../src/data/levels'
import {
  CHALLENGES, CHALLENGE_UPGRADE_TIER, MODES, MODE_INFO, STARS_PER_LEVEL, isMode, nextMode, resolveLevel, upgradeCap,
} from '../src/data/modes'
import { SPECS, SPEC_IDS, TOWERS, TOWER_TYPES } from '../src/data/towers'
import { BRANCH_IDS, NO_BOOSTS, TREE_COST, UPGRADES, UPGRADE_TIERS, boostsFor, noUpgrades, starsSpent } from '../src/data/upgrades'
import { applyOutcome, emptySave, parseSave, starsEarned } from '../src/save'
import { Session, type Outcome } from '../src/session'
import { levelBudget } from '../src/sim/balance'
import { BUILD_ORDER, Bot } from '../src/sim/bot'
import { World } from '../src/sim/world'
import { DT, MID, run, testLevel } from './field'

describe('game modes', () => {
  it('cycle through campaign, the two challenges and endless', () => {
    expect(MODES).toEqual(['campaign', 'laststand', 'siege', 'endless'])
    let mode = MODES[0]
    for (let i = 0; i < MODES.length; i++) mode = nextMode(mode)
    expect(mode).toBe(MODES[0])
    for (const id of MODES) expect(MODE_INFO[id].name.length).toBeGreaterThan(0)
    expect(isMode('siege')).toBe(true)
    expect(isMode('heroic')).toBe(false)
  })

  it('leave the campaign level exactly as written', () => {
    for (const level of LEVELS) expect(resolveLevel(level, 'campaign')).toBe(level)
  })

  it('turn a level into a challenge: same map, other lives, gold, waves and towers', () => {
    for (const level of LEVELS) {
      for (const mode of CHALLENGES) {
        const def = level.modes[mode]
        const played = resolveLevel(level, mode)
        expect(played.paths).toBe(level.paths)
        expect(played.plots).toBe(level.plots)
        expect(played.lives).toBe(def.lives)
        expect(played.startGold).toBe(def.gold)
        expect(played.waves).toBe(def.waves)
        for (const type of TOWER_TYPES) expect(played.towers.includes(type), `${level.id} ${mode} ${type}`).toBe(!def.lockedTowers.includes(type))
      }
    }
  })
})

describe('challenge data', () => {
  for (const level of LEVELS) {
    describe(level.name, () => {
      it('gives one life in both challenges and caps the star tree', () => {
        for (const mode of CHALLENGES) {
          expect(level.modes[mode].lives).toBe(1)
          expect(upgradeCap(level, mode)).toBe(CHALLENGE_UPGRADE_TIER)
        }
        expect(upgradeCap(level, 'campaign')).toBeUndefined()
        expect(upgradeCap(level, 'endless')).toBeUndefined()
      })

      it('makes the last stand six hard waves with every tower of the level', () => {
        const def = level.modes.laststand
        expect(def.waves).toHaveLength(6)
        expect(def.lockedTowers).toHaveLength(0)
        // no gentle opening: the first wave already weighs several campaign openings, and the gold is there to meet it
        const waves = levelBudget(resolveLevel(level, 'laststand')).waves
        const campaign = levelBudget(level).waves
        expect(waves[0].hp).toBeGreaterThanOrEqual(campaign[0].hp * 2)
        expect(waves[waves.length - 1].hp).toBe(Math.max(...waves.map((w) => w.hp)))
        expect(def.gold).toBeGreaterThan(level.startGold)
      })

      it('makes the siege one long wave with part of the towers locked', () => {
        const def = level.modes.siege
        expect(def.waves).toHaveLength(1)
        expect(def.lockedTowers.length).toBeGreaterThan(0)
        expect(def.lockedTowers.length).toBeLessThan(level.towers.length)
        const wave = levelBudget(resolveLevel(level, 'siege')).waves[0]
        expect(wave.duration).toBeGreaterThan(120)
        // something that is left can still shoot at the sky
        const open = level.towers.filter((t) => !def.lockedTowers.includes(t))
        const flyers = def.waves[0].groups.some((grp) => ENEMIES[grp.type].flying)
        const specs = level.specs ?? []
        const reachesAir = open.includes('archer') || open.includes('mage') || (open.includes('artillery') && specs.includes('rocket'))
        if (flyers) expect(reachesAir).toBe(true)
      })

      it('only references existing paths, enemies, towers and branches', () => {
        for (const mode of CHALLENGES) {
          const def = level.modes[mode]
          for (const wave of def.waves) {
            for (const grp of wave.groups) {
              expect(ENEMIES[grp.type], grp.type).toBeDefined()
              expect(grp.path ?? 0).toBeLessThan(level.paths.length)
              expect(grp.count).toBeGreaterThan(0)
            }
          }
          for (const type of def.lockedTowers) expect(TOWERS[type]).toBeDefined()
          for (const spec of def.lockedSpecs ?? []) expect(SPECS[spec]).toBeDefined()
        }
        expect(level.endless.gold).toBeGreaterThan(0)
        expect(level.endless.lives).toBeGreaterThan(0)
      })

      it('attaches advice to the opening of both challenges', () => {
        for (const mode of CHALLENGES) expect(level.modes[mode].waves[0].tip?.length ?? 0).toBeGreaterThan(10)
      })
    })
  }
})

describe('a challenge battle', () => {
  it('refuses the locked towers and still rates a win with one star', () => {
    const level = testLevel({
      modes: {
        ...LEVELS[0].modes,
        siege: { lives: 1, gold: 900, lockedTowers: ['barracks'], waves: [{ groups: [{ type: 'goblin', count: 1, gap: 1, at: 0 }] }] },
      },
    })
    const w = new World(level, 'hard', { mode: 'siege' })
    expect(w.mode).toBe('siege')
    expect(w.gold).toBe(900)
    expect(w.lives).toBe(1)
    expect(w.build(0, 'barracks')).toBeNull()
    expect(w.build(0, 'archer')).not.toBeNull()
    run(w, 1.2)
    w.callWave()
    for (let t = 0; t < 60 && w.result === null; t += DT) w.update(DT)
    expect(w.result).toBe('win')
    expect(w.stars).toBe(1)
  })

  it('is lost by a single enemy at the gate', () => {
    const w = new World(testLevel(), 'hard', { mode: 'laststand' })
    const goblin = w.spawnEnemy(ENEMIES.goblin, 0, 620)
    run(w, 3)
    expect(goblin.removed).toBe(true)
    expect(w.result).toBe('lose')
  })

  it('lets a bot play around a locked tower type', () => {
    const level = LEVELS[0]
    const w = new World(level, 'easy', { mode: 'siege' })
    const bot = new Bot(w, { order: BUILD_ORDER })
    for (let t = 0; t < 20; t += DT) {
      bot.update(DT)
      w.update(DT)
    }
    expect(w.towers.length).toBeGreaterThan(0)
    for (const t of w.towers) expect(level.modes.siege.lockedTowers).not.toContain(t.type)
  })
})

describe('played by the panel of bots', { timeout: 120_000 }, () => {
  /** Lives a bot gives away in a challenge when it cannot run out of them. */
  function leaked(levelIndex: number, mode: (typeof CHALLENGES)[number], difficulty: (typeof DIFFICULTIES)[number], bot: number): number {
    const level = LEVELS[levelIndex]
    const plenty = 999
    const roomy = { ...level, modes: { ...level.modes, [mode]: { ...level.modes[mode], lives: plenty } } }
    const w = new World(roomy, difficulty, { mode })
    const player = new Bot(w, { order: [...BUILD_ORDER.slice(bot), ...BUILD_ORDER.slice(0, bot)] })
    for (let t = 0; t < 1500 && w.result === null; t += DT) {
      player.update(DT)
      w.update(DT)
    }
    return w.result === 'win' ? plenty - w.lives : plenty
  }

  it('a challenge is within reach on easy and never a gift on hard', () => {
    LEVELS.forEach((level, i) => {
      for (const mode of CHALLENGES) {
        const easy = [0, 1, 2, 3].map((bot) => leaked(i, mode, 'easy', bot))
        const hard = [0, 1, 2, 3].map((bot) => leaked(i, mode, 'hard', bot))
        // a simple bot loses only a handful of enemies: a careful player with a hero and spells can stop them all
        expect(Math.min(...easy), `${level.id} ${mode} easy`).toBeLessThanOrEqual(6)
        expect(Math.min(...hard), `${level.id} ${mode} hard`).toBeGreaterThan(0)
        expect(easy.reduce((a, b) => a + b, 0), `${level.id} ${mode}`).toBeLessThan(hard.reduce((a, b) => a + b, 0))
      }
    })
  })
})

// ---------------------------------------------------------------- star tree

describe('star tree', () => {
  it('has four branches of three steps, each with a name, a text and a price', () => {
    expect(BRANCH_IDS).toHaveLength(4)
    for (const id of BRANCH_IDS) {
      expect(UPGRADES[id].nodes).toHaveLength(UPGRADE_TIERS)
      for (const node of UPGRADES[id].nodes) {
        expect(node.name.length).toBeGreaterThan(0)
        expect(node.text).toMatch(/\d/)
        expect(node.cost).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('costs more stars than the campaign alone can pay, and fewer than there are', () => {
    const campaign = LEVELS.length * 3
    const all = LEVELS.length * STARS_PER_LEVEL
    expect(TREE_COST).toBeGreaterThan(campaign)
    expect(TREE_COST).toBeLessThan(all)
    expect(starsSpent(noUpgrades())).toBe(0)
    expect(starsSpent({ ...noUpgrades(), archery: 2, tactics: 1 })).toBe(3)
  })

  it('is worth nothing without steps and only a few percent with all of them', () => {
    expect(boostsFor(noUpgrades())).toEqual(NO_BOOSTS)
    const full = boostsFor({ archery: 3, sorcery: 3, gunnery: 3, tactics: 3 })
    for (const [key, value] of Object.entries(full)) {
      const base = NO_BOOSTS[key as keyof typeof NO_BOOSTS]
      expect(value, key).not.toBe(base)
      expect(Math.abs(value - base), key).toBeLessThanOrEqual(0.25)
    }
  })

  it('counts only the steps a mode allows', () => {
    const owned = { archery: 3, sorcery: 3, gunnery: 3, tactics: 3 }
    const capped = boostsFor(owned, 1)
    expect(capped.archerRange).toBeGreaterThan(1)
    expect(capped.archerCooldown).toBe(1)
    expect(capped.archerDouble).toBe(0)
    expect(boostsFor(owned, 0)).toEqual(NO_BOOSTS)
  })

  it('changes the numbers a battle fights with', () => {
    const plain = new World(testLevel())
    const owned = { archery: 3, sorcery: 3, gunnery: 3, tactics: 3 }
    const boosted = new World(testLevel(), 'hard', { upgrades: owned })
    const b = boostsFor(owned)
    expect(boosted.stats('archer', 0, null).range).toBe(Math.round(TOWERS.archer.range[0] * b.archerRange))
    expect(boosted.stats('archer', 2, null).cooldown).toBeCloseTo(TOWERS.archer.cooldown[2] * b.archerCooldown)
    expect(boosted.stats('mage', 2, null).dmg[1]).toBeGreaterThan(TOWERS.mage.dmg[2][1])
    expect(boosted.stats('artillery', 1, null).splash).toBeGreaterThan(TOWERS.artillery.splash[1])
    expect(boosted.stats('barracks', 0, null).soldierHp).toBe(Math.round(TOWERS.barracks.soldierHp[0] * b.soldierHp))
    expect(boosted.stats('mage', 2, 'storm').range).toBe(Math.round(SPECS.storm.range * b.mageRange))
    expect(boosted.hero.maxHp).toBeGreaterThan(plain.hero.maxHp)
    expect(boosted.spellCooldown('fire')).toBeLessThan(plain.spellCooldown('fire'))
    expect(boosted.reinforceLife).toBeGreaterThan(plain.reinforceLife)
    // nothing owned: the very same numbers as the data
    expect(plain.stats('archer', 0, null).range).toBe(TOWERS.archer.range[0])
    expect(plain.stats('mage', 2, 'frost')).toBe(SPECS.frost)
  })

  it('lets mage towers cut through part of the magic resistance', () => {
    const fight = (upgrades: typeof NO_UPGRADES | undefined): number => {
      const w = new World(testLevel(), 'hard', { upgrades })
      w.build(0, 'mage')
      const shaman = w.spawnEnemy({ ...ENEMIES.shaman }, 0, MID)
      // hold it in place so that both battles count the same shots
      shaman.speedFactor = 0
      run(w, 8)
      return ENEMIES.shaman.hp - shaman.hp
    }
    const NO_UPGRADES = noUpgrades()
    expect(fight({ ...NO_UPGRADES, sorcery: 3 })).toBeGreaterThan(fight(undefined))
  })

  it('applies only the first step in a challenge', () => {
    const owned = { archery: 3, sorcery: 0, gunnery: 0, tactics: 0 }
    const w = new World(testLevel(), 'hard', { mode: 'laststand', upgrades: owned })
    expect(w.stats('archer', 0, null).range).toBeGreaterThan(TOWERS.archer.range[0])
    expect(w.stats('archer', 0, null).cooldown).toBe(TOWERS.archer.cooldown[0])
  })
})

// ---------------------------------------------------------------- records

function outcome(over: Partial<Outcome>): Outcome {
  return { levelId: 'meadow', mode: 'campaign', difficulty: 'normal', won: true, stars: 3, wave: 9, score: 0, ...over }
}

describe('records', () => {
  it('keeps the best campaign rating per difficulty and ignores defeats', () => {
    const save = emptySave()
    applyOutcome(save, outcome({ stars: 2 }))
    applyOutcome(save, outcome({ stars: 1 }))
    applyOutcome(save, outcome({ won: false, stars: 0 }))
    applyOutcome(save, outcome({ difficulty: 'hard', stars: 1 }))
    expect(save.stars.normal.meadow).toBe(2)
    expect(save.stars.hard.meadow).toBe(1)
    expect(save.stars.easy.meadow).toBeUndefined()
  })

  it('notes a won challenge once', () => {
    const save = emptySave()
    applyOutcome(save, outcome({ mode: 'siege', stars: 1 }))
    applyOutcome(save, outcome({ mode: 'siege', stars: 1 }))
    applyOutcome(save, outcome({ mode: 'laststand', won: false, stars: 0 }))
    expect(save.challenges.normal).toEqual({ laststand: [], siege: ['meadow'] })
  })

  it('keeps the best endless run by score and says when it is a new record', () => {
    const save = emptySave()
    expect(applyOutcome(save, outcome({ mode: 'endless', won: false, stars: 0, wave: 12, score: 5000 }))).toBe(true)
    expect(applyOutcome(save, outcome({ mode: 'endless', won: false, stars: 0, wave: 14, score: 4000 }))).toBe(false)
    expect(applyOutcome(save, outcome({ mode: 'endless', won: false, stars: 0, wave: 15, score: 9000 }))).toBe(true)
    expect(save.endless.normal.meadow).toEqual({ wave: 15, score: 9000 })
    expect(save.endless.hard.meadow).toBeUndefined()
  })

  it('pays every star once, whatever difficulty it was won on', () => {
    const save = emptySave()
    const ids = LEVELS.map((level) => level.id)
    expect(starsEarned(save, ids)).toBe(0)
    applyOutcome(save, outcome({ stars: 2 }))
    applyOutcome(save, outcome({ difficulty: 'easy', stars: 3 }))
    applyOutcome(save, outcome({ difficulty: 'hard', stars: 1 }))
    expect(starsEarned(save, ids)).toBe(3)
    applyOutcome(save, outcome({ mode: 'siege', stars: 1 }))
    applyOutcome(save, outcome({ mode: 'siege', stars: 1, difficulty: 'hard' }))
    applyOutcome(save, outcome({ mode: 'laststand', stars: 1, levelId: 'creek' }))
    expect(starsEarned(save, ids)).toBe(5)
    // endless pays no stars, and a level that is gone pays nothing
    applyOutcome(save, outcome({ mode: 'endless', won: false, stars: 0, score: 99999 }))
    applyOutcome(save, outcome({ levelId: 'gone', stars: 3 }))
    expect(starsEarned(save, ids)).toBe(5)
  })

  it('reads the new parts of a save and drops what is malformed', () => {
    const save = parseSave({
      stars: { normal: { meadow: 3 } },
      challenges: { normal: { siege: ['meadow', 'meadow', 7], laststand: 'x' }, hard: 3 },
      endless: { easy: { meadow: { wave: 12.7, score: 800 }, creek: { wave: 0, score: 5 }, bad: 'x' } },
      upgrades: { archery: 2, sorcery: 99, gunnery: -1, tactics: 'x' },
      seen: ['goblin', 'goblin', 4],
      tips: ['build'],
    })
    expect(save.challenges.normal).toEqual({ laststand: [], siege: ['meadow'] })
    expect(save.challenges.hard).toEqual({ laststand: [], siege: [] })
    expect(save.endless.easy).toEqual({ meadow: { wave: 12, score: 800 } })
    expect(save.upgrades).toEqual({ archery: 2, sorcery: UPGRADE_TIERS, gunnery: 0, tactics: 0 })
    expect(save.seen).toEqual(['goblin'])
    // an old save simply has none of it
    const old = parseSave({ stars: { meadow: 2 }, tips: [] })
    expect(old.challenges).toEqual(emptySave().challenges)
    expect(old.upgrades).toEqual(noUpgrades())
    expect(old.seen).toEqual([])
  })
})

describe('a played session', () => {
  const sfx = { play: () => undefined } as unknown as Sfx

  it('reports a challenge win with its mode and one star', () => {
    const seen: Outcome[] = []
    const session = new Session(0, sfx, (o) => seen.push(o), { mode: 'siege', difficulty: 'easy' })
    const w = session.world
    expect(session.mode).toBe('siege')
    w.waveIndex = w.waveCount - 1
    session.advance(1 / 30)
    session.advance(1 / 30)
    expect(seen).toEqual([{ levelId: LEVELS[0].id, mode: 'siege', difficulty: 'easy', won: true, stars: 1, wave: 1, score: 0 }])
  })

  it('reports a defeat too, once', () => {
    const seen: Outcome[] = []
    const session = new Session(0, sfx, (o) => seen.push(o))
    session.world.callWave()
    session.world.lives = 0
    session.advance(1 / 30)
    session.advance(1 / 30)
    session.leave()
    expect(seen).toHaveLength(1)
    expect(seen[0].won).toBe(false)
    expect(seen[0].stars).toBe(0)
  })

  it('counts an endless battle the player walks away from, but no other', () => {
    const seen: Outcome[] = []
    const endless = new Session(1, sfx, (o) => seen.push(o), { mode: 'endless' })
    endless.leave()
    expect(seen).toHaveLength(0)
    endless.world.callWave()
    endless.world.callWave()
    endless.leave()
    endless.leave()
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ mode: 'endless', won: false, wave: 2 })
    expect(seen[0].score).toBeGreaterThan(0)
    const campaign = new Session(0, sfx, (o) => seen.push(o))
    campaign.world.callWave()
    campaign.leave()
    expect(seen).toHaveLength(1)
  })

  it('carries the star tree into the battle', () => {
    const session = new Session(0, sfx, () => undefined, { upgrades: { ...noUpgrades(), archery: 1 } })
    expect(session.world.stats('archer', 0, null).range).toBeGreaterThan(TOWERS.archer.range[0])
  })

  it('opens every branch in endless, also on the first map', () => {
    const session = new Session(0, sfx, () => undefined, { mode: 'endless' })
    for (const id of SPEC_IDS) expect(session.world.specAllowed(id)).toBe(true)
  })
})
