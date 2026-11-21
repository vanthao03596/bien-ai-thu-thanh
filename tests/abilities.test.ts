import { describe, expect, it } from 'vitest'
import { hasAnim } from '../src/assets'
import { ENEMIES, abilityOf, type EnemyDef } from '../src/data/enemies'
import { LEVELS, type LevelDef } from '../src/data/levels'
import { World } from '../src/sim/world'

const DT = 1 / 60

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
    waves: [{ groups: [{ type: 'goblin', count: 1, gap: 1, at: 0 }] }],
    modes: LEVELS[0].modes,
    endless: LEVELS[0].endless,
    ...overrides,
  }
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) w.update(DT)
}

/** The road of the test level runs along y = 192. */
const ROAD_Y = 192

describe('enemy abilities', () => {
  it('every ability points at things that exist and can be animated', () => {
    for (const def of Object.values<EnemyDef>(ENEMIES)) {
      for (const a of def.abilities ?? []) {
        if (a.kind === 'summon' || a.kind === 'split') expect(ENEMIES[a.type], `${def.type} -> ${a.type}`).toBeDefined()
        // cast abilities play the attack row, which flyers do not have
        if ('cooldown' in a) expect(hasAnim(def.sheet, 'attack'), `${def.type}:${a.kind}`).toBe(true)
      }
      if (def.abilities) expect(def.trait, def.type).toBeTruthy()
    }
  })

  it('an archer shoots soldiers from a distance', () => {
    const w = new World(testLevel())
    w.castReinforcements(400, ROAD_Y)
    const men = w.soldiers.filter((s) => s.kind === 'reinforcement')
    const archer = w.spawnEnemy(ENEMIES.goblin_archer, 0, 400 - 92)
    archer.abilityCd[0] = 0
    run(w, 0.8)
    // still out of reach of their swords, yet somebody already bleeds
    expect(archer.blocker).toBeNull()
    expect(men.some((s) => s.hp < s.maxHp)).toBe(true)
    expect(archer.hp).toBe(ENEMIES.goblin_archer.hp)
  })

  it('a necromancer raises a limited number of skeletons that pay no bounty', () => {
    const w = new World(testLevel())
    const summon = abilityOf(ENEMIES.necromancer, 'summon')
    if (!summon) throw new Error('no summon ability')
    w.moveHero(700, 400)
    const necro = w.spawnEnemy(ENEMIES.necromancer, 0, 100)
    necro.abilityCd[0] = 0
    // long enough for two casts, too short for anything to reach the gate
    run(w, summon.cooldown + 4)
    const raised = w.enemies.filter((e) => e.summoned)
    expect(raised.length).toBeGreaterThanOrEqual(summon.count * 2)
    expect(raised.length).toBeLessThanOrEqual(summon.count * summon.casts)
    expect(raised.every((e) => e.def.type === 'skeleton')).toBe(true)
    expect(necro.castsLeft[0]).toBeLessThan(summon.casts)
    const gold = w.gold
    w.damageEnemy(raised[0], 9999, 'true')
    expect(w.gold).toBe(gold)
  })

  it('a brood bat bursts into small bats when it dies', () => {
    const w = new World(testLevel())
    const brood = w.spawnEnemy(ENEMIES.brood_bat, 0, 200)
    w.damageEnemy(brood, 9999, 'true')
    const bats = w.enemies.filter((e) => e.def.type === 'bat')
    expect(bats).toHaveLength(3)
    for (const b of bats) expect(Math.abs(b.dist - 200)).toBeLessThan(20)
    // the children are ordinary enemies: they pay and they leak
    expect(bats.every((b) => !b.summoned)).toBe(true)
  })

  it('a berserker speeds up once it is badly hurt', () => {
    const w = new World(testLevel())
    const orc = w.spawnEnemy(ENEMIES.berserker, 0, 100)
    run(w, 0.1)
    const calm = w.enemySpeed(orc)
    expect(orc.enraged).toBe(false)
    w.damageEnemy(orc, ENEMIES.berserker.hp * 0.6, 'true')
    run(w, 0.1)
    expect(orc.enraged).toBe(true)
    expect(w.enemySpeed(orc)).toBeGreaterThan(calm * 1.5)
    // the rage is baked into the factors once, nothing has to ask for it again
    const rage = abilityOf(ENEMIES.berserker, 'enrage')
    expect(orc.dmgFactor).toBe(rage?.dmg)
    expect(orc.speedFactor).toBe(rage?.speed)
  })

  it('a troll grows its health back, but only while left alone', () => {
    const w = new World(testLevel())
    const troll = w.spawnEnemy(ENEMIES.troll, 0, 100)
    w.damageEnemy(troll, 200, 'true')
    const hurt = troll.hp
    run(w, 1)
    expect(troll.hp).toBe(hurt)
    run(w, 4)
    expect(troll.hp).toBeGreaterThan(hurt + 20)
    // steady damage keeps the wound open
    const before = troll.hp
    for (let i = 0; i < 180; i++) {
      w.damageEnemy(troll, 1, 'true')
      w.update(DT)
    }
    expect(troll.hp).toBeLessThan(before)
  })

  it('a warchief makes the enemies around it march faster', () => {
    const w = new World(testLevel())
    const near = w.spawnEnemy(ENEMIES.goblin, 0, 110)
    const far = w.spawnEnemy(ENEMIES.goblin, 0, 500)
    w.spawnEnemy(ENEMIES.warchief, 0, 100)
    run(w, 0.2)
    expect(w.enemySpeed(near)).toBeGreaterThan(ENEMIES.goblin.speed * 1.2)
    expect(w.enemySpeed(far)).toBe(ENEMIES.goblin.speed)
  })

  it('a hexer silences a tower, which then holds its fire', () => {
    const w = new World(testLevel())
    const t = w.build(0, 'archer')
    if (!t) throw new Error('no tower')
    run(w, 1.1)
    const hex = abilityOf(ENEMIES.hexer, 'disable')
    if (!hex) throw new Error('no disable ability')
    const hexer = w.spawnEnemy(ENEMIES.hexer, 0, 300)
    hexer.abilityCd[0] = 0
    run(w, 1)
    expect(t.silenceT).toBeGreaterThan(hex.time - 1.5)
    // nothing leaves the tower while the curse lasts
    w.projectiles = []
    const hp = hexer.hp
    run(w, 2)
    expect(hexer.hp).toBe(hp)
    hexer.abilityCd[0] = 99
    run(w, hex.time)
    expect(t.silenceT).toBeLessThanOrEqual(0)
    expect(hexer.hp).toBeLessThan(hp)
  })

  it('a boss slams the ground and hurts every soldier around it', () => {
    const w = new World(testLevel())
    const t = w.build(0, 'barracks')
    if (!t) throw new Error('no tower')
    run(w, 6)
    const boss = w.spawnEnemy(ENEMIES.ogre_king, 0, 300)
    boss.abilityCd[0] = 0
    let quakes = 0
    for (let i = 0; i < 60 * 14; i++) {
      w.update(DT)
      quakes += w.events.filter((ev) => ev === 'quake').length
      w.events.length = 0
    }
    expect(quakes).toBeGreaterThan(0)
  })

  it('a ghost wolf walks straight through soldiers', () => {
    const w = new World(testLevel())
    w.build(0, 'barracks')
    run(w, 6)
    const ghost = w.spawnEnemy(ENEMIES.ghost_wolf, 0, 200)
    const wolf = w.spawnEnemy(ENEMIES.wolf, 0, 200)
    run(w, 4)
    expect(ghost.blocker).toBeNull()
    expect(ghost.dist).toBeGreaterThan(200 + ENEMIES.ghost_wolf.speed * 3.5)
    expect(wolf.blocker !== null || wolf.state === 'dying' || wolf.removed).toBe(true)
  })

  it('a healer cannot cast while it is pinned down in melee', () => {
    const w = new World(testLevel())
    w.build(0, 'barracks')
    run(w, 6)
    const shaman = w.spawnEnemy(ENEMIES.shaman, 0, 300)
    run(w, 6)
    expect(shaman.blocker).not.toBeNull()
    const casts = (): number => w.events.filter((ev) => ev === 'heal').length
    w.events.length = 0
    const orc = w.spawnEnemy(ENEMIES.orc, 0, 290)
    w.damageEnemy(orc, 30, 'true')
    run(w, 3)
    expect(casts()).toBe(0)
  })
})
