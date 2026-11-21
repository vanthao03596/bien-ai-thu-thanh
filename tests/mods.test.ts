import { describe, expect, it } from 'vitest'
import { ENEMIES } from '../src/data/enemies'
import { FROST_SLOW, MAGE_SLOW_FACTOR, STUN_IMMUNITY } from '../src/data/towers'
import {
  addMod, hasMod, hasteMod, isFrozen, modOf, poisonMod, slowMod, speedOf, stunGuardMod, stunMod, tickMods,
  type ActiveMod, type ModDef,
} from '../src/sim/mods'
import { World } from '../src/sim/world'
import { MID, run, testLevel } from './field'

describe('stacking rule', () => {
  it('lets effects of different kinds run side by side and multiplies their speeds', () => {
    const mods: ActiveMod[] = []
    expect(addMod(mods, slowMod(0.5, 2))).toBe(true)
    expect(addMod(mods, hasteMod(1.3, 2))).toBe(true)
    expect(addMod(mods, poisonMod(4, 2))).toBe(true)
    expect(mods).toHaveLength(3)
    expect(speedOf(mods)).toBeCloseTo(0.5 * 1.3)
  })

  it('a stronger effect takes the place of a weaker one of the same kind', () => {
    const mods: ActiveMod[] = []
    addMod(mods, slowMod(0.6, 5))
    expect(addMod(mods, slowMod(0.5, 1))).toBe(true)
    expect(mods).toHaveLength(1)
    expect(modOf(mods, 'slow')?.def.speed).toBe(0.5)
    expect(modOf(mods, 'slow')?.left).toBe(1)
  })

  it('a weaker effect is turned away while the stronger one runs', () => {
    const mods: ActiveMod[] = []
    addMod(mods, slowMod(0.5, 1))
    expect(addMod(mods, slowMod(0.6, 5))).toBe(false)
    expect(modOf(mods, 'slow')?.def.speed).toBe(0.5)
    expect(modOf(mods, 'slow')?.left).toBe(1)
  })

  it('an equal effect renews the time and never cuts it short', () => {
    const mods: ActiveMod[] = []
    addMod(mods, slowMod(0.5, 1))
    expect(addMod(mods, slowMod(0.5, 3))).toBe(false)
    expect(mods).toHaveLength(1)
    expect(modOf(mods, 'slow')?.left).toBe(3)
    addMod(mods, slowMod(0.5, 0.5))
    expect(modOf(mods, 'slow')?.left).toBe(3)
  })

  it('stacks layers only when the effect says so', () => {
    const bleed: ModDef = { id: 'poison', level: 1, duration: 2, dps: 1, stacks: true }
    const mods: ActiveMod[] = []
    addMod(mods, bleed)
    expect(addMod(mods, bleed)).toBe(true)
    expect(mods).toHaveLength(2)
  })

  it('keeps a weaker effect from being replaced when it opts out', () => {
    const mods: ActiveMod[] = []
    addMod(mods, slowMod(0.6, 2))
    const stubborn: ModDef = { ...slowMod(0.5, 2), replacesLower: false }
    expect(addMod(mods, stubborn)).toBe(false)
    expect(modOf(mods, 'slow')?.def.speed).toBe(0.6)
  })

  it('refuses an effect that one already there bans', () => {
    const mods: ActiveMod[] = []
    addMod(mods, stunGuardMod(4))
    expect(addMod(mods, stunMod(1))).toBe(false)
    expect(isFrozen(mods)).toBe(false)
  })

  it('lifts the banned effects when the new one says so, and keeps them off', () => {
    const silence: ModDef = { id: 'stun_guard', level: 1, duration: 3, bans: ['haste'], removeBanned: true }
    const mods: ActiveMod[] = []
    addMod(mods, hasteMod(1.3, 5))
    addMod(mods, slowMod(0.5, 5))
    expect(addMod(mods, silence)).toBe(true)
    expect(hasMod(mods, 'haste')).toBe(false)
    expect(hasMod(mods, 'slow')).toBe(true)
    expect(addMod(mods, hasteMod(1.3, 5))).toBe(false)
  })

  it('counts effects down and drops them when they run out', () => {
    const mods: ActiveMod[] = []
    addMod(mods, slowMod(0.5, 1))
    addMod(mods, hasteMod(1.3, 2))
    tickMods(mods, 1.5)
    expect(hasMod(mods, 'slow')).toBe(false)
    expect(modOf(mods, 'haste')?.left).toBeCloseTo(0.5)
    expect(speedOf(mods)).toBeCloseTo(1.3)
  })
})

describe('effects in battle', () => {
  it('a frost slow is not weakened by a plain mage slow landing on top of it', () => {
    const w = new World(testLevel())
    const ogre = w.spawnEnemy(ENEMIES.ogre, 0, MID)
    addMod(ogre.mods, slowMod(FROST_SLOW.factor, FROST_SLOW.time))
    addMod(ogre.mods, slowMod(MAGE_SLOW_FACTOR, 9))
    expect(w.enemySpeed(ogre)).toBeCloseTo(ENEMIES.ogre.speed * FROST_SLOW.factor)
    run(w, FROST_SLOW.time + 0.1)
    expect(w.enemySpeed(ogre)).toBe(ENEMIES.ogre.speed)
  })

  it('a stun leaves a guard behind that outlasts it by the immunity time', () => {
    const w = new World(testLevel())
    const ogre = w.spawnEnemy(ENEMIES.ogre, 0, MID)
    addMod(ogre.mods, stunMod(1))
    addMod(ogre.mods, stunGuardMod(1 + STUN_IMMUNITY))
    const at = ogre.dist
    run(w, 0.9)
    expect(ogre.dist).toBe(at)
    run(w, 0.3)
    expect(ogre.dist).toBeGreaterThan(at)
    expect(addMod(ogre.mods, stunMod(1))).toBe(false)
    run(w, STUN_IMMUNITY)
    expect(addMod(ogre.mods, stunMod(1))).toBe(true)
  })

  it('poison ticks through the effect list and credits whoever applied it', () => {
    const w = new World(testLevel())
    const t = w.build(0, 'archer')
    if (!t) throw new Error('no tower')
    const ogre = w.spawnEnemy(ENEMIES.ogre, 0, 20)
    const credited: number[] = []
    w.bus.on('enemyDamaged', ({ amount, source }) => {
      if (source.tower === t) credited.push(amount)
    })
    addMod(ogre.mods, poisonMod(10, 2), { tower: t, soldier: null })
    run(w, 3)
    expect(ENEMIES.ogre.hp - ogre.hp).toBeCloseTo(20, 0)
    expect(credited.reduce((a, b) => a + b, 0)).toBeCloseTo(20, 0)
    expect(hasMod(ogre.mods, 'poison')).toBe(false)
  })
})
