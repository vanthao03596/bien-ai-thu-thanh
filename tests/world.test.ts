import { describe, expect, it } from 'vitest'
import { ENEMIES } from '../src/data/enemies'
import { LEVELS, type LevelDef } from '../src/data/levels'
import { HERO, SELL_REFUND, SPELLS, TOWERS } from '../src/data/towers'
import { World, inRange, starsFor } from '../src/sim/world'

const DT = 1 / 60

/** A straight test road with one plot beside it and no scripted waves to interfere. */
function testLevel(overrides: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 'test',
    name: 'Test',
    blurb: '',
    seed: 1,
    paths: [[[0, 6], [20, 6]]],
    spawns: ['edge'],
    water: [],
    bridges: [],
    gate: [20, 6],
    plots: [[10, 4.4], [14, 4.4]],
    heroStart: [23, 13],
    props: [],
    towers: ['archer', 'barracks', 'mage', 'artillery'],
    startGold: 1000,
    lives: 20,
    waves: [{ groups: [{ type: 'goblin', count: 3, gap: 1, at: 0 }] }, { groups: [{ type: 'goblin', count: 2, gap: 1, at: 0 }] }],
    ...overrides,
  }
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) w.update(DT)
}

describe('enemies', () => {
  it('walk the road and cost lives at the gate', () => {
    const w = new World(testLevel())
    const e = w.spawnEnemy(ENEMIES.goblin, 0)
    const x0 = e.x
    run(w, 1)
    expect(e.x).toBeGreaterThan(x0 + ENEMIES.goblin.speed * 0.9)
    run(w, w.paths[0].length / ENEMIES.goblin.speed)
    expect(e.removed).toBe(true)
    expect(w.lives).toBe(19)
    expect(w.enemies).toHaveLength(0)
  })

  it('big enemies cost more lives', () => {
    const w = new World(testLevel())
    w.spawnEnemy(ENEMIES.ogre, 0, w.paths[0].length - 1)
    run(w, 1)
    expect(w.lives).toBe(20 - ENEMIES.ogre.lives)
  })

  it('armor only reduces physical damage and magic resistance only magic', () => {
    const w = new World(testLevel())
    const knight = w.spawnEnemy(ENEMIES.dark_knight, 0)
    w.damageEnemy(knight, 100, 'physical')
    expect(knight.hp).toBeCloseTo(ENEMIES.dark_knight.hp - 100 * (1 - ENEMIES.dark_knight.armor))
    const before = knight.hp
    w.damageEnemy(knight, 50, 'magic')
    expect(knight.hp).toBeCloseTo(before - 50)

    const shaman = w.spawnEnemy(ENEMIES.shaman, 0)
    w.damageEnemy(shaman, 10, 'magic')
    expect(shaman.hp).toBeCloseTo(ENEMIES.shaman.hp - 10 * (1 - ENEMIES.shaman.magicRes))
    w.damageEnemy(shaman, 10, 'true')
    expect(shaman.hp).toBeCloseTo(ENEMIES.shaman.hp - 10 * (1 - ENEMIES.shaman.magicRes) - 10)
  })

  it('pay their bounty once when killed', () => {
    const w = new World(testLevel())
    const e = w.spawnEnemy(ENEMIES.orc, 0)
    w.damageEnemy(e, 9999, 'true')
    w.damageEnemy(e, 9999, 'true')
    expect(w.gold).toBe(1000 + ENEMIES.orc.gold)
    expect(w.kills).toBe(1)
    run(w, 2)
    expect(w.enemies).toHaveLength(0)
  })

  it('a shaman heals wounded allies nearby', () => {
    const w = new World(testLevel())
    const orc = w.spawnEnemy(ENEMIES.orc, 0, 200)
    w.spawnEnemy(ENEMIES.shaman, 0, 190)
    w.damageEnemy(orc, 40, 'true')
    const wounded = orc.hp
    run(w, 7)
    expect(orc.hp).toBeGreaterThan(wounded)
    expect(orc.hp).toBeLessThanOrEqual(ENEMIES.orc.hp)
  })
})

describe('towers', () => {
  it('cost gold, take time to build and cannot be stacked on one plot', () => {
    const w = new World(testLevel())
    const t = w.build(0, 'archer')
    expect(t).not.toBeNull()
    expect(w.gold).toBe(1000 - TOWERS.archer.cost[0])
    expect(w.build(0, 'mage')).toBeNull()
    expect(t?.buildT).toBeGreaterThan(0)
    run(w, 1.1)
    expect(t?.buildT).toBeLessThanOrEqual(0)
  })

  it('cannot be built without enough gold or when the level forbids the type', () => {
    const poor = new World(testLevel({ startGold: 50 }))
    expect(poor.build(0, 'archer')).toBeNull()
    expect(poor.gold).toBe(50)
    const limited = new World(testLevel({ towers: ['archer'] }))
    expect(limited.build(0, 'mage')).toBeNull()
    expect(limited.build(0, 'archer')).not.toBeNull()
  })

  it('an archer tower shoots walkers in range and kills them', () => {
    const w = new World(testLevel())
    const t = w.build(0, 'archer')
    if (!t) throw new Error('no tower')
    run(w, 1.1)
    w.upgrade(t)
    w.upgrade(t)
    const spent = TOWERS.archer.cost[0] + TOWERS.archer.cost[1] + TOWERS.archer.cost[2]
    for (let i = 0; i < 3; i++) w.spawnEnemy(ENEMIES.goblin, 0, i * 12)
    run(w, 25)
    expect(w.kills).toBe(3)
    expect(w.lives).toBe(20)
    expect(w.gold).toBe(1000 - spent + 3 * ENEMIES.goblin.gold)
  })

  it('artillery ignores flying enemies while archers hit them', () => {
    const ground = new World(testLevel())
    ground.build(0, 'artillery')
    ground.build(1, 'artillery')
    run(ground, 1.1)
    ground.spawnEnemy(ENEMIES.bat, 0)
    run(ground, 20)
    expect(ground.kills).toBe(0)
    expect(ground.lives).toBe(19)

    const air = new World(testLevel())
    air.build(0, 'archer')
    air.build(1, 'archer')
    run(air, 1.1)
    air.spawnEnemy(ENEMIES.bat, 0)
    run(air, 20)
    expect(air.kills).toBe(1)
    expect(air.lives).toBe(20)
  })

  it('artillery damages every walker inside the blast', () => {
    const w = new World(testLevel())
    const t = w.build(0, 'artillery')
    run(w, 1.1)
    if (!t) throw new Error('no tower')
    // packed, slow targets so one bomb catches them all
    const pack = [0, 1, 2, 3].map((i) => w.spawnEnemy(ENEMIES.ogre, 0, 300 + i * 4))
    run(w, 2.5)
    expect(pack.every((e) => e.hp < ENEMIES.ogre.hp)).toBe(true)
  })

  it('upgrades raise the level and selling refunds part of the investment', () => {
    const w = new World(testLevel())
    const t = w.build(0, 'mage')
    if (!t) throw new Error('no tower')
    expect(w.upgrade(t)).toBe(false) // still under construction
    run(w, 1.1)
    expect(w.upgrade(t)).toBe(true)
    expect(w.upgrade(t)).toBe(true)
    expect(w.upgrade(t)).toBe(false) // already at the top level
    expect(t.level).toBe(2)
    const invested = TOWERS.mage.cost[0] + TOWERS.mage.cost[1] + TOWERS.mage.cost[2]
    expect(w.gold).toBe(1000 - invested)
    expect(w.sell(t)).toBe(true)
    expect(w.gold).toBe(1000 - invested + Math.floor(invested * SELL_REFUND))
    expect(w.plots[0].tower).toBeNull()
    expect(w.towers).toHaveLength(0)
    expect(w.build(0, 'archer')).not.toBeNull()
  })

  it('a level 3 mage tower slows what it hits', () => {
    const w = new World(testLevel())
    const t = w.build(0, 'mage')
    if (!t) throw new Error('no tower')
    run(w, 1.1)
    w.upgrade(t)
    w.upgrade(t)
    const ogre = w.spawnEnemy(ENEMIES.ogre, 0, 300)
    run(w, 3)
    expect(ogre.slowT).toBeGreaterThan(0)
  })
})

describe('barracks', () => {
  it('trains three soldiers who block walkers on the road', () => {
    const w = new World(testLevel())
    const t = w.build(0, 'barracks')
    if (!t) throw new Error('no tower')
    run(w, 6)
    expect(t.slots.every((s) => s.soldier !== null)).toBe(true)
    expect(w.soldiers.filter((s) => s.kind === 'soldier')).toHaveLength(3)

    const ogre = w.spawnEnemy(ENEMIES.ogre, 0, 200)
    run(w, 12)
    const held = ogre.dist
    run(w, 3)
    // the ogre is stuck in melee instead of marching on
    expect(ogre.dist).toBe(held)
    expect(ogre.blocker).not.toBeNull()
    expect(ogre.hp).toBeLessThan(ENEMIES.ogre.hp)
  })

  it('never blocks flying enemies', () => {
    const w = new World(testLevel())
    w.build(0, 'barracks')
    run(w, 6)
    const bat = w.spawnEnemy(ENEMIES.bat, 0)
    run(w, 30)
    expect(bat.removed).toBe(true)
    expect(w.lives).toBe(19)
  })

  it('replaces fallen soldiers after a while', () => {
    const w = new World(testLevel())
    const t = w.build(0, 'barracks')
    if (!t) throw new Error('no tower')
    run(w, 6)
    const first = t.slots[0].soldier
    if (!first) throw new Error('no soldier')
    w.damageSoldier(first, 9999)
    run(w, 2)
    expect(t.slots[0].soldier).toBeNull()
    run(w, 12)
    expect(t.slots[0].soldier).not.toBeNull()
    expect(t.slots[0].soldier).not.toBe(first)
  })

  it('moves its rally point only inside its range', () => {
    const w = new World(testLevel())
    const t = w.build(0, 'barracks')
    if (!t) throw new Error('no tower')
    run(w, 6)
    expect(w.setRally(t, t.x + 400, t.y)).toBe(false)
    expect(w.setRally(t, t.x + 60, t.y + 40)).toBe(true)
    run(w, 5)
    for (const slot of t.slots) {
      const s = slot.soldier
      if (!s) throw new Error('no soldier')
      expect(Math.hypot(s.x - (t.x + 60), s.y - (t.y + 40))).toBeLessThan(16)
    }
  })

  it('selling the barracks dismisses its soldiers and frees their enemy', () => {
    const w = new World(testLevel())
    const t = w.build(0, 'barracks')
    if (!t) throw new Error('no tower')
    run(w, 6)
    const ogre = w.spawnEnemy(ENEMIES.ogre, 0, 280)
    run(w, 4)
    expect(ogre.blocker).not.toBeNull()
    w.sell(t)
    run(w, 1)
    expect(w.soldiers.filter((s) => s.kind === 'soldier')).toHaveLength(0)
    expect(ogre.blocker).toBeNull()
    const d = ogre.dist
    run(w, 1)
    expect(ogre.dist).toBeGreaterThan(d)
  })
})

describe('hero and spells', () => {
  it('the hero walks where ordered and fights what comes near', () => {
    const w = new World(testLevel())
    const road = { x: 320, y: 192 }
    w.moveHero(road.x, road.y)
    run(w, 12)
    expect(Math.hypot(w.hero.x - road.x, w.hero.y - road.y)).toBeLessThan(2)
    const goblin = w.spawnEnemy(ENEMIES.goblin, 0, 300)
    run(w, 8)
    expect(goblin.state === 'dying' || goblin.removed).toBe(true)
    expect(w.lives).toBe(20)
  })

  it('the hero falls, then returns after the respawn delay', () => {
    const w = new World(testLevel())
    w.damageSoldier(w.hero, 99999)
    run(w, 2)
    expect(w.hero.state).toBe('dead')
    run(w, HERO.respawn + 1)
    expect(w.hero.state).toBe('idle')
    expect(w.hero.hp).toBe(w.hero.maxHp)
  })

  it('fire rain burns a pack and then cools down', () => {
    const w = new World(testLevel())
    const pack = [0, 1, 2, 3, 4].map((i) => w.spawnEnemy(ENEMIES.goblin, 0, 200 + i * 3))
    run(w, 0.05)
    const target = pack[2]
    expect(w.castFireRain(target.x + 30, target.y)).toBe(true)
    expect(w.castFireRain(target.x, target.y)).toBe(false)
    run(w, 3)
    expect(w.kills).toBeGreaterThanOrEqual(3)
    expect(w.spellCd.fire).toBeGreaterThan(SPELLS.fire.cooldown - 5)
    run(w, SPELLS.fire.cooldown)
    expect(w.spellCd.fire).toBe(0)
  })

  it('reinforcements hold the road for a while, then leave', () => {
    const w = new World(testLevel())
    expect(w.castReinforcements(300, 100)).toBe(true) // clicked off the road: snaps onto it
    const men = w.soldiers.filter((s) => s.kind === 'reinforcement')
    expect(men).toHaveLength(SPELLS.reinforce.count)
    for (const m of men) expect(Math.abs(m.y - 192)).toBeLessThan(2)
    run(w, SPELLS.reinforce.life + 3)
    expect(w.soldiers.filter((s) => s.kind === 'reinforcement')).toHaveLength(0)
  })
})

describe('waves and results', () => {
  it('waits for the player, then pays for calling the next wave early', () => {
    const w = new World(testLevel())
    run(w, 5)
    expect(w.waveIndex).toBe(-1)
    expect(w.enemies).toHaveLength(0)
    expect(w.callWave()).toBe(true)
    expect(w.waveIndex).toBe(0)
    expect(w.earlyBonus()).toBeGreaterThan(0)
    const bonus = w.earlyBonus()
    const gold = w.gold
    expect(w.callWave()).toBe(true)
    expect(w.gold).toBe(gold + bonus)
    expect(w.waveIndex).toBe(1)
    expect(w.canCallWave()).toBe(false)
  })

  it('starts the next wave by itself when the timer runs out', () => {
    const w = new World(testLevel())
    w.callWave()
    run(w, 30)
    expect(w.waveIndex).toBe(1)
  })

  it('is lost when the lives run out and won when every wave is cleared', () => {
    const lost = new World(testLevel({ lives: 2, heroStart: [23, 13] }))
    lost.callWave()
    run(lost, 60)
    expect(lost.result).toBe('lose')
    expect(lost.lives).toBe(0)

    const won = new World(testLevel())
    won.build(0, 'archer')
    won.build(1, 'archer')
    run(won, 1.1)
    won.callWave()
    run(won, 80)
    expect(won.result).toBe('win')
    expect(won.lives).toBe(20)
    expect(won.stars).toBe(3)
  })

  it('refuses commands once the battle is decided', () => {
    const w = new World(testLevel({ lives: 1 }))
    w.callWave()
    run(w, 60)
    expect(w.result).toBe('lose')
    expect(w.build(0, 'archer')).toBeNull()
    expect(w.castFireRain(100, 100)).toBe(false)
    expect(w.callWave()).toBe(false)
  })
})

describe('helpers', () => {
  it('rates the remaining lives in stars', () => {
    expect(starsFor(20, 20)).toBe(3)
    expect(starsFor(18, 20)).toBe(3)
    expect(starsFor(17, 20)).toBe(2)
    expect(starsFor(8, 20)).toBe(2)
    expect(starsFor(7, 20)).toBe(1)
    expect(starsFor(1, 20)).toBe(1)
  })

  it('range checks are squashed vertically', () => {
    expect(inRange(0, 0, 100, 0, 100)).toBe(true)
    expect(inRange(0, 0, 0, 100, 100)).toBe(false)
    expect(inRange(0, 0, 0, 74, 100)).toBe(true)
  })

  it('ships three playable levels', () => {
    expect(LEVELS).toHaveLength(3)
  })
})
