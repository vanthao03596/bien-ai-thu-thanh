import { describe, expect, it } from 'vitest'
import { atlasFrame } from '../src/assets'
import { ENEMIES } from '../src/data/enemies'
import { LEVELS, type LevelDef } from '../src/data/levels'
import {
  FROST_SLOW,
  MARKSMAN_PIERCE,
  MAX_SKILL_RANK,
  SELL_REFUND,
  SKILLS,
  SKILL_INFO,
  SPECS,
  SPEC_CHOICES,
  SPEC_IDS,
  TOWERS,
  TOWER_TYPES,
  skillText,
  type SkillId,
  type SpecId,
  type TowerType,
} from '../src/data/towers'
import type { Tower } from '../src/sim/types'
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
    specs: SPEC_IDS,
    startGold: 9000,
    lives: 20,
    waves: [{ groups: [{ type: 'goblin', count: 1, gap: 1, at: 0 }] }],
    ...overrides,
  }
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) w.update(DT)
}

/** A finished level 3 tower on the first plot. */
function topTower(w: World, type: TowerType, plot = 0): Tower {
  const t = w.build(plot, type)
  if (!t) throw new Error('no tower')
  run(w, 1.1)
  w.upgrade(t)
  w.upgrade(t)
  return t
}

/** A specialised tower with the given skill ranks, standing beside the middle of the road. */
function specTower(w: World, spec: SpecId, ranks: readonly [number, number] = [0, 0], plot = 0): Tower {
  const t = topTower(w, SPECS[spec].base, plot)
  if (!w.specialize(t, spec)) throw new Error(`cannot specialise into ${spec}`)
  for (const slot of [0, 1] as const) {
    for (let i = 0; i < ranks[slot]; i++) w.buySkill(t, slot)
  }
  return t
}

/** Road position right below the first plot. */
const MID = 320

describe('specialisation data', () => {
  it('gives every tower type two branches with two skills each', () => {
    for (const type of TOWER_TYPES) {
      const [a, b] = SPEC_CHOICES[type]
      expect(a).not.toBe(b)
      for (const id of [a, b]) {
        const spec = SPECS[id]
        expect(spec.base).toBe(type)
        expect(spec.id).toBe(id)
        expect(spec.cost).toBeGreaterThan(TOWERS[type].cost[2])
        expect(spec.skills[0]).not.toBe(spec.skills[1])
        expect(atlasFrame('ui/icons_16', spec.icon).w).toBe(16)
      }
    }
    expect(SPEC_IDS).toHaveLength(8)
  })

  it('uses every skill exactly once and describes each rank', () => {
    const used = SPEC_IDS.flatMap((id) => SPECS[id].skills)
    const all = Object.keys(SKILLS) as SkillId[]
    expect([...used].sort()).toEqual([...all].sort())
    for (const id of all) {
      const info = SKILL_INFO[id]
      expect(info.cost).toHaveLength(MAX_SKILL_RANK)
      expect(atlasFrame('ui/icons_16', info.icon).w).toBe(16)
      const texts = [1, 2, 3].map((rank) => skillText(id, rank))
      for (const text of texts) expect(text.length).toBeGreaterThan(10)
      // the numbers grow with the rank, so the three lines differ
      expect(new Set(texts).size).toBe(3)
    }
  })

  it('opens the branches level by level', () => {
    expect(LEVELS[0].specs ?? []).toHaveLength(0)
    for (const level of LEVELS) {
      for (const id of level.specs ?? []) expect(SPECS[id], `${level.id}: ${id}`).toBeDefined()
    }
    const last = LEVELS[LEVELS.length - 1]
    expect([...(last.specs ?? [])].sort()).toEqual([...SPEC_IDS].sort())
  })
})

describe('specialising a tower', () => {
  it('needs a level 3 tower of the right type, an open branch and the gold', () => {
    const w = new World(testLevel())
    const t = w.build(0, 'archer')
    if (!t) throw new Error('no tower')
    run(w, 1.1)
    expect(w.specialize(t, 'repeater')).toBe(false)
    w.upgrade(t)
    w.upgrade(t)
    expect(w.awaitsSpec(t)).toBe(true)
    expect(w.specialize(t, 'frost')).toBe(false)
    const gold = w.gold
    expect(w.specialize(t, 'marksman')).toBe(true)
    expect(w.gold).toBe(gold - SPECS.marksman.cost)
    expect(t.spec).toBe('marksman')
    expect(w.towerRange(t)).toBe(SPECS.marksman.range)
    // the choice is final
    expect(w.specialize(t, 'repeater')).toBe(false)
    expect(w.upgradeCost(t)).toBeNull()

    const closed = new World(testLevel({ specs: ['repeater'] }))
    const c = topTower(closed, 'archer')
    expect(closed.specialize(c, 'marksman')).toBe(false)
    expect(closed.specialize(c, 'repeater')).toBe(true)

    const none = new World(testLevel({ specs: undefined }))
    expect(none.specialize(topTower(none, 'mage'), 'frost')).toBe(false)

    const poor = new World(testLevel({ startGold: 400 }))
    const p = topTower(poor, 'archer')
    expect(poor.gold).toBeLessThan(SPECS.repeater.cost)
    expect(poor.specialize(p, 'repeater')).toBe(false)
  })

  it('sells skills rank by rank and refunds them with the tower', () => {
    const w = new World(testLevel())
    const t = topTower(w, 'archer')
    expect(w.skillCost(t, 0)).toBeNull()
    expect(w.buySkill(t, 0)).toBe(false)
    w.specialize(t, 'repeater')
    const costs = SKILLS.poison.cost
    for (let rank = 0; rank < MAX_SKILL_RANK; rank++) {
      expect(w.skillCost(t, 0)).toBe(costs[rank])
      expect(w.buySkill(t, 0)).toBe(true)
      expect(w.skillRank(t, 'poison')).toBe(rank + 1)
    }
    expect(w.skillCost(t, 0)).toBeNull()
    expect(w.buySkill(t, 0)).toBe(false)
    expect(w.skillRank(t, 'volley')).toBe(0)
    expect(w.skillRank(t, 'chain')).toBe(0)
    const invested = TOWERS.archer.cost[0] + TOWERS.archer.cost[1] + TOWERS.archer.cost[2] + SPECS.repeater.cost + costs[0] + costs[1] + costs[2]
    expect(t.invested).toBe(invested)
    expect(w.gold).toBe(9000 - invested)
    w.callWave()
    w.sell(t)
    expect(w.gold).toBe(9000 - invested + Math.floor(invested * SELL_REFUND))
  })
})

describe('archer branches', () => {
  it('the repeater poisons its targets', () => {
    const w = new World(testLevel())
    const t = specTower(w, 'repeater', [3, 0])
    const ogre = w.spawnEnemy(ENEMIES.ogre, 0, MID)
    run(w, 1.5)
    expect(ogre.poisonT).toBeGreaterThan(0)
    expect(ogre.poisonDps).toBe(SKILLS.poison.dps[2])
    // the poison keeps working after the tower is gone
    w.sell(t)
    run(w, 0.6)
    const hp = ogre.hp
    run(w, 1)
    expect(hp - ogre.hp).toBeCloseTo(SKILLS.poison.dps[2], 0)
  })

  it('the repeater looses a volley at several enemies at once', () => {
    const w = new World(testLevel())
    specTower(w, 'repeater', [0, 1])
    const pack = [0, 1, 2, 3].map((i) => w.spawnEnemy(ENEMIES.ogre, 0, MID - 40 + i * 25))
    let most = 0
    for (let i = 0; i < 60 * 3; i++) {
      w.update(DT)
      most = Math.max(most, new Set(w.projectiles.filter((p) => p.kind === 'arrow').map((p) => p.target)).size)
    }
    expect(most).toBeGreaterThanOrEqual(SKILLS.volley.targets[0])
    expect(pack.filter((e) => e.hp < ENEMIES.ogre.hp).length).toBeGreaterThanOrEqual(3)
  })

  it('the marksman outranges everything and punches through armor', () => {
    const w = new World(testLevel())
    const t = specTower(w, 'marksman')
    expect(w.towerRange(t)).toBeGreaterThan(TOWERS.archer.range[2] + 40)
    const knight = w.spawnEnemy(ENEMIES.dark_knight, 0, MID)
    const through = 1 - ENEMIES.dark_knight.armor * (1 - MARKSMAN_PIERCE)
    expect(w.damageEnemy(knight, 100, 'physical', MARKSMAN_PIERCE)).toBe(Math.floor(100 * through))
    expect(knight.hp).toBe(ENEMIES.dark_knight.hp - Math.floor(100 * through))
    const hp = knight.hp
    run(w, 1.2)
    // one arrow, at least the minimum roll through half the armor
    expect(hp - knight.hp).toBeGreaterThanOrEqual(Math.floor(SPECS.marksman.dmg[0] * through))
  })

  it('a crippling arrow slows what it hits', () => {
    const w = new World(testLevel())
    specTower(w, 'marksman', [0, 2])
    const ogre = w.spawnEnemy(ENEMIES.ogre, 0, MID)
    run(w, 1.2)
    expect(ogre.slowT).toBeGreaterThan(0)
    expect(w.enemySpeed(ogre)).toBeCloseTo(ENEMIES.ogre.speed * SKILLS.cripple.factor)
  })
})

describe('mage branches', () => {
  it('the frost tower slows harder and longer than a plain mage', () => {
    const w = new World(testLevel())
    specTower(w, 'frost')
    const ogre = w.spawnEnemy(ENEMIES.ogre, 0, MID)
    run(w, 2)
    expect(ogre.slowFactor).toBe(FROST_SLOW.factor)
    expect(w.enemySpeed(ogre)).toBeCloseTo(ENEMIES.ogre.speed * FROST_SLOW.factor)
  })

  it('a blizzard freezes a pack but only slows a boss', () => {
    const w = new World(testLevel())
    specTower(w, 'frost', [2, 0])
    const pack = [0, 1, 2].map((i) => w.spawnEnemy(ENEMIES.ogre, 0, MID - 10 + i * 10))
    const boss = w.spawnEnemy(ENEMIES.demon_boss, 0, MID + 6)
    let frozen = 0
    for (let i = 0; i < 60 * 3 && frozen === 0; i++) {
      w.update(DT)
      frozen = pack.filter((e) => e.stunT > 0).length
    }
    expect(frozen).toBe(3)
    expect(boss.stunT).toBe(0)
    expect(boss.slowT).toBeGreaterThan(0)
    const at = pack.map((e) => e.dist)
    run(w, SKILLS.blizzard.freeze[1] - 0.2)
    expect(pack.map((e) => e.dist)).toEqual(at)
    // once thawed they walk on, and cannot be frozen again right away
    run(w, 1)
    expect(pack.every((e, i) => e.dist > at[i])).toBe(true)
  })

  it('shattering ice splashes damage and chill around the target', () => {
    const w = new World(testLevel())
    specTower(w, 'frost', [0, 3])
    const front = w.spawnEnemy(ENEMIES.ogre, 0, MID + 10)
    const behind = w.spawnEnemy(ENEMIES.ogre, 0, MID)
    run(w, 1.5)
    expect(front.hp).toBeLessThan(ENEMIES.ogre.hp)
    expect(behind.hp).toBeLessThan(ENEMIES.ogre.hp)
    expect(behind.slowT).toBeGreaterThan(0)
  })

  it('storm lightning jumps to a second enemy and wears armor down', () => {
    const w = new World(testLevel())
    specTower(w, 'storm', [1, 3])
    const front = w.spawnEnemy(ENEMIES.dark_knight, 0, MID + 20)
    const behind = w.spawnEnemy(ENEMIES.dark_knight, 0, MID)
    run(w, 1.6)
    expect(front.hp).toBeLessThan(ENEMIES.dark_knight.hp)
    expect(behind.hp).toBeLessThan(ENEMIES.dark_knight.hp)
    expect(front.armor).toBeCloseTo(ENEMIES.dark_knight.armor - SKILLS.sunder.shred[2])
  })

  it('sundered armor never drops below zero', () => {
    const w = new World(testLevel())
    specTower(w, 'storm', [0, 3])
    const king = w.spawnEnemy(ENEMIES.ogre_king, 0, MID)
    run(w, 6)
    expect(king.armor).toBe(0)
    expect(king.rawArmor).toBe(0)
    const hp = king.hp
    w.damageEnemy(king, 100, 'physical')
    expect(hp - king.hp).toBeCloseTo(100)
  })
})

describe('artillery branches', () => {
  it('a bombard shell throws out bomblets and leaves burning oil', () => {
    const w = new World(testLevel())
    const t = specTower(w, 'bombard', [2, 1])
    const ogre = w.spawnEnemy(ENEMIES.ogre, 0, MID)
    let bomblets = 0
    for (let i = 0; i < 60 * 3; i++) {
      w.update(DT)
      bomblets = Math.max(bomblets, w.projectiles.filter((p) => p.kind === 'bomb' && p.splash === SKILLS.cluster.splash).length)
      if (w.zones.length > 0 && bomblets > 0) break
    }
    expect(bomblets).toBe(SKILLS.cluster.bomblets[1])
    expect(w.zones).toHaveLength(1)
    // standing in the fire costs health every moment, without flashing as a hit
    w.sell(t)
    w.projectiles = []
    const zone = w.zones[0]
    const victim = w.spawnEnemy(ENEMIES.ogre, 0, ogre.dist)
    victim.x = zone.x
    const hitAt = victim.hitAt
    w.update(DT)
    expect(victim.hp).toBeLessThan(ENEMIES.ogre.hp)
    expect(victim.hitAt).toBe(hitAt)
    run(w, SKILLS.oil.time + 0.1)
    expect(w.zones).toHaveLength(0)
  })

  it('rockets bring down flyers, which shells cannot reach', () => {
    const w = new World(testLevel())
    specTower(w, 'rocket')
    w.spawnEnemy(ENEMIES.bat, 0, MID - 120)
    run(w, 8)
    expect(w.kills).toBe(1)
    expect(w.lives).toBe(20)
  })

  it('a concussive rocket stuns, a barrage fires many at once', () => {
    const w = new World(testLevel())
    specTower(w, 'rocket', [1, 3])
    const pack = [0, 1, 2].map((i) => w.spawnEnemy(ENEMIES.ogre, 0, MID - 20 + i * 20))
    let stunned = false
    let rockets = 0
    for (let i = 0; i < 60 * 4; i++) {
      w.update(DT)
      stunned ||= pack.some((e) => e.stunT > 0)
      rockets = Math.max(rockets, w.projectiles.filter((p) => p.kind === 'rocket').length)
    }
    expect(stunned).toBe(true)
    expect(rockets).toBeGreaterThanOrEqual(SKILLS.barrage.rockets[0])
  })
})

describe('barracks branches', () => {
  it('the guard trains tougher soldiers, also the ones already on the field', () => {
    const w = new World(testLevel())
    const t = topTower(w, 'barracks')
    run(w, 6)
    const veteran = t.slots[0].soldier
    if (!veteran) throw new Error('no soldier')
    expect(veteran.maxHp).toBe(TOWERS.barracks.soldierHp[2])
    w.specialize(t, 'guard')
    expect(veteran.maxHp).toBe(SPECS.guard.soldierHp)
    expect(veteran.hp).toBe(SPECS.guard.soldierHp)
    expect(veteran.armor).toBe(SPECS.guard.soldierArmor)
    w.damageSoldier(veteran, 99999)
    run(w, 14)
    expect(t.slots[0].soldier?.maxHp).toBe(SPECS.guard.soldierHp)
  })

  it('guards mend their wounds and their armor bites back', () => {
    const fight = (ranks: readonly [number, number]): { soldierHp: number; ogreHp: number } => {
      const w = new World(testLevel())
      const t = specTower(w, 'guard', ranks)
      run(w, 6)
      const ogre = w.spawnEnemy(ENEMIES.ogre, 0, MID - 20)
      run(w, 12)
      const hp = t.slots.reduce((n, slot) => n + (slot.soldier?.hp ?? 0), 0)
      return { soldierHp: hp, ogreHp: ogre.hp }
    }
    const plain = fight([0, 0])
    const mending = fight([3, 0])
    const thorny = fight([0, 3])
    expect(mending.soldierHp).toBeGreaterThan(plain.soldierHp)
    expect(thorny.ogreHp).toBeLessThan(plain.ogreHp)
  })

  it('blades cleave through a pack', () => {
    const total = (ranks: readonly [number, number]): number => {
      const w = new World(testLevel())
      specTower(w, 'blade', ranks)
      run(w, 6)
      const pack = [0, 1, 2, 3, 4, 5].map((i) => w.spawnEnemy(ENEMIES.ogre, 0, MID - 30 + i * 3))
      run(w, 10)
      return pack.reduce((n, e) => n + e.hp, 0)
    }
    expect(total([3, 0])).toBeLessThan(total([0, 0]) - 100)
  })

  it('thrown knives reach flyers', () => {
    const w = new World(testLevel())
    specTower(w, 'blade', [0, 3])
    run(w, 6)
    const bat = w.spawnEnemy(ENEMIES.brood_bat, 0, MID - 100)
    run(w, 5)
    expect(bat.hp).toBeLessThan(ENEMIES.brood_bat.hp)

    const plain = new World(testLevel())
    specTower(plain, 'blade')
    run(plain, 6)
    const safe = plain.spawnEnemy(ENEMIES.brood_bat, 0, MID - 100)
    run(plain, 5)
    expect(safe.hp).toBe(ENEMIES.brood_bat.hp)
  })
})
