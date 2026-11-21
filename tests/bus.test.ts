import { describe, expect, it } from 'vitest'
import { ENEMIES, type EnemyType } from '../src/data/enemies'
import { LEVELS } from '../src/data/levels'
import { HERO, TOWERS } from '../src/data/towers'
import { NOTICE_LIFE, Notices, type Notice } from '../src/notices'
import { EventBus } from '../src/sim/bus'
import { BattleStats, creditName } from '../src/sim/stats'
import type { Pop, Soldier } from '../src/sim/types'
import { POP_LIFE, World } from '../src/sim/world'
import { DT, MID, run, testLevel } from './field'

describe('event bus', () => {
  it('hands the payload to every listener of that event, in order', () => {
    const bus = new EventBus()
    const log: string[] = []
    expect(bus.heard('towerSold')).toBe(false)
    bus.on('towerSold', ({ refund }) => log.push(`a${refund}`))
    bus.on('towerSold', ({ refund }) => log.push(`b${refund}`))
    bus.on('enemyLeaked', () => log.push('leak'))
    expect(bus.heard('towerSold')).toBe(true)
    const w = new World(testLevel())
    const tower = w.build(0, 'archer')
    if (!tower) throw new Error('no tower')
    bus.emit('towerSold', { tower, refund: 42 })
    expect(log).toEqual(['a42', 'b42'])
  })

  it('tells who killed an enemy', () => {
    const w = new World(testLevel())
    const tower = w.build(0, 'archer')
    const kills: (string | null)[] = []
    w.bus.on('enemyKilled', ({ enemy, source }) => kills.push(`${enemy.def.type}:${source.tower?.type ?? source.soldier?.kind ?? 'nobody'}`))
    run(w, 1.1)
    // held in place, or it would walk out of range before the last arrow
    w.spawnEnemy(ENEMIES.goblin, 0, MID).speedFactor = 0
    run(w, 6)
    expect(tower).not.toBeNull()
    expect(kills).toEqual(['goblin:archer'])
    w.damageEnemy(w.spawnEnemy(ENEMIES.goblin, 0, 10), 999, 'true')
    expect(kills[1]).toBe('goblin:nobody')
  })

  it('credits a barracks for what its soldiers do, and the hero for his own blows', () => {
    const w = new World(testLevel({ heroStart: [16, 6] }))
    const barracks = w.build(0, 'barracks')
    const sources: string[] = []
    w.bus.on('enemyDamaged', ({ source }) => sources.push(source.tower ? source.tower.type : (source.soldier?.kind ?? 'nobody')))
    run(w, 4)
    w.spawnEnemy(ENEMIES.ogre, 0, MID - 30)
    run(w, 6)
    expect(barracks).not.toBeNull()
    expect(sources).toContain('barracks')
    sources.length = 0
    const w2 = new World(testLevel({ heroStart: [10, 6] }))
    w2.bus.on('enemyDamaged', ({ source }) => sources.push(source.tower ? source.tower.type : (source.soldier?.kind ?? 'nobody')))
    w2.spawnEnemy(ENEMIES.ogre, 0, MID - 30)
    run(w2, 6)
    expect(new Set(sources)).toEqual(new Set(['hero']))
  })

  it('announces waves, early calls, leaks, bosses, building and selling', () => {
    const w = new World(testLevel())
    const log: string[] = []
    w.bus.on('waveStarted', ({ wave, groups }) => log.push(`wave ${wave} ${groups.map((g) => `${g.count} ${g.type}`).join()}`))
    w.bus.on('earlyWaveCalled', ({ wave, reward, secondsLeft, paths }) => log.push(`early ${wave} ${reward} ${Math.round(secondsLeft)} ${paths}`))
    w.bus.on('enemyLeaked', ({ enemy, lives }) => log.push(`leak ${enemy.def.type} ${lives}`))
    w.bus.on('bossKilled', ({ enemy }) => log.push(`boss ${enemy.def.type}`))
    w.bus.on('towerBuilt', ({ tower }) => log.push(`built ${tower.type}`))
    w.bus.on('towerSold', ({ tower, refund }) => log.push(`sold ${tower.type} ${refund}`))
    const t = w.build(0, 'mage')
    if (!t) throw new Error('no tower')
    w.sell(t)
    w.callWave()
    run(w, 1)
    const bonus = w.earlyBonus()
    const left = Math.round(w.waveTimer ?? 0)
    w.callWave()
    w.damageEnemy(w.spawnEnemy(ENEMIES.ogre_king, 0, 10), 99999, 'true')
    w.spawnEnemy(ENEMIES.ogre, 0, 638)
    run(w, 1)
    expect(log).toEqual([
      'built mage',
      `sold mage ${TOWERS.mage.cost[0]}`,
      'wave 0 3 goblin',
      `early 1 ${bonus} ${left} 1`,
      'wave 1 2 goblin',
      'boss ogre_king',
      `leak ogre ${ENEMIES.ogre.lives}`,
    ])
  })
})

describe('battle statistics', () => {
  it('count kills and damage per kind of tower, an overkill only for what was left', () => {
    const w = new World(testLevel())
    const stats = new BattleStats(w.bus)
    w.build(0, 'archer')
    run(w, 1.1)
    w.spawnEnemy(ENEMIES.goblin, 0, MID).speedFactor = 0
    w.spawnEnemy(ENEMIES.goblin, 0, MID - 14).speedFactor = 0
    run(w, 12)
    expect(stats.kills.archer).toBe(2)
    expect(stats.damage.archer).toBe(ENEMIES.goblin.hp * 2)
    expect(BattleStats.top(stats.kills)).toBe('archer')
    expect(creditName('archer')).toBe(TOWERS.archer.name)
    expect(creditName('hero')).toBe(HERO.name)
  })

  it('put spells and reinforcements under one heading and count the lives lost', () => {
    const w = new World(testLevel())
    const stats = new BattleStats(w.bus)
    expect(BattleStats.top(stats.kills)).toBeNull()
    for (let i = 0; i < 5; i++) w.spawnEnemy(ENEMIES.goblin, 0, MID + i * 4)
    w.castFireRain(MID + 8, 192)
    run(w, 2)
    expect(stats.kills.spell).toBeGreaterThanOrEqual(3)
    expect(BattleStats.top(stats.damage)).toBe('spell')
    w.spawnEnemy(ENEMIES.ogre, 0, 638)
    run(w, 1)
    expect(stats.leaked).toBe(ENEMIES.ogre.lives)
  })
})

describe('pop words', () => {
  /** Runs the battle and gathers every pop that shows up. */
  function watch(w: World, seconds: number): Pop[] {
    const seen = new Set<Pop>()
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      w.update(DT)
      for (const p of w.pops) seen.add(p)
    }
    return [...seen]
  }

  it('an archer tower shows its word only for the arrow that kills', () => {
    const w = new World(testLevel())
    w.build(0, 'archer')
    run(w, 1.1)
    const ogre = w.spawnEnemy(ENEMIES.ogre, 0, MID)
    ogre.speedFactor = 0
    expect(watch(w, 6)).toHaveLength(0)
    expect(ogre.hp).toBeLessThan(ENEMIES.ogre.hp)
    w.damageEnemy(ogre, 99999, 'true')
    let kills = 0
    w.bus.on('enemyKilled', () => (kills += 1))
    const pops: Pop[] = []
    for (let i = 0; i < 30; i++) {
      w.spawnEnemy(ENEMIES.goblin, 0, MID).speedFactor = 0
      pops.push(...watch(w, 6))
    }
    expect(kills).toBe(30)
    // a share of the kills, never all of them and never none
    expect(pops.length).toBeGreaterThan(30 * TOWERS.archer.pop.chance * 0.5)
    expect(pops.length).toBeLessThan(30)
    for (const p of pops) {
      expect(TOWERS.archer.pop.words).toContain(p.text)
      expect(Math.abs(p.angle)).toBeLessThanOrEqual(0.37)
    }
  })

  it('a pop leaves by itself', () => {
    const w = new World(testLevel())
    w.pops.push({ text: 'x', x: 0, y: 0, t: 0, angle: 0 })
    run(w, POP_LIFE + 0.1)
    expect(w.pops).toHaveLength(0)
  })

  it('every tower has words for its blows', () => {
    for (const def of Object.values(TOWERS)) {
      expect(def.pop.words.length).toBeGreaterThan(0)
      expect(def.pop.chance).toBeGreaterThan(0)
      expect(def.pop.chance).toBeLessThanOrEqual(1)
    }
    // fast shooters only mark the kill
    expect(TOWERS.archer.pop.on).toBe('kill')
  })
})

describe('soldiers', () => {
  function barracks(w: World): Soldier[] {
    const t = w.build(0, 'barracks')
    if (!t) throw new Error('no tower')
    run(w, 5)
    const soldiers = t.slots.map((slot) => slot.soldier)
    if (soldiers.some((s) => s === null)) throw new Error('the soldiers are not out yet')
    return soldiers as Soldier[]
  }

  it('split up over a group instead of crowding the first enemy', () => {
    const w = new World(testLevel())
    const soldiers = barracks(w)
    const orcs = [0, 1, 2].map((i) => w.spawnEnemy(ENEMIES.orc, 0, MID - 20 - i * 14))
    run(w, 2.5)
    expect(new Set(soldiers.map((s) => s.target)).size).toBe(3)
    for (const orc of orcs) expect(orc.blocker).not.toBeNull()
  })

  it('a helper leaves for an enemy nobody holds yet', () => {
    const w = new World(testLevel())
    const soldiers = barracks(w)
    const first = w.spawnEnemy(ENEMIES.orc, 0, MID - 20)
    run(w, 2)
    expect(soldiers.every((s) => s.target === first)).toBe(true)
    const second = w.spawnEnemy(ENEMIES.orc, 0, MID - 40)
    run(w, 1)
    expect(second.blocker).not.toBeNull()
    expect(first.blocker).not.toBeNull()
    expect(soldiers.filter((s) => s.target === first)).toHaveLength(2)
  })

  it('nobody drops a big enemy to chase a small one', () => {
    const w = new World(testLevel())
    const soldiers = barracks(w)
    const ogre = w.spawnEnemy(ENEMIES.ogre, 0, MID - 20)
    // harmless, so that all three soldiers are still standing when the goblin comes
    ogre.dmgFactor = 0
    run(w, 2)
    const goblin = w.spawnEnemy(ENEMIES.goblin, 0, MID - 40)
    const at = goblin.dist
    run(w, 1)
    expect(soldiers.every((s) => s.target === ogre)).toBe(true)
    expect(goblin.blocker).toBeNull()
    expect(goblin.dist).toBeGreaterThan(at)
  })
})

describe('notices', () => {
  function book(seen: string[] = [], retired: string[] = []): { seen: string[]; retired: string[]; met: EnemyType[]; tips: string[]; onSeen: (t: EnemyType) => void; onTip: (id: string) => void } {
    const met: EnemyType[] = []
    const tips: string[] = []
    return { seen, retired, met, tips, onSeen: (t) => met.push(t), onTip: (id) => tips.push(id) }
  }

  it('show the advice of the first wave from the start, then every new enemy once', () => {
    const level = testLevel({
      waves: [
        { groups: [{ type: 'goblin', count: 1, gap: 1, at: 0 }], tip: 'first' },
        { groups: [{ type: 'goblin', count: 1, gap: 1, at: 0 }, { type: 'wolf', count: 1, gap: 1, at: 0 }], tip: 'second' },
      ],
    })
    const w = new World(level)
    const b = book()
    const notices = new Notices(w, b)
    expect(notices.current).toEqual<Notice>({ kind: 'tip', text: 'first' })
    w.callWave()
    notices.dismiss()
    expect(notices.current).toEqual<Notice>({ kind: 'enemy', type: 'goblin' })
    notices.dismiss()
    expect(notices.current).toBeNull()
    w.callWave()
    expect(notices.current).toEqual<Notice>({ kind: 'enemy', type: 'wolf' })
    notices.dismiss()
    expect(notices.current).toEqual<Notice>({ kind: 'tip', text: 'second' })
    expect(b.met).toEqual(['goblin', 'wolf'])
    expect(b.tips).toEqual(['wave:test:campaign:0', 'wave:test:campaign:1'])
  })

  it('stay silent about what the save already knows', () => {
    const level = testLevel({ waves: [{ groups: [{ type: 'goblin', count: 1, gap: 1, at: 0 }], tip: 'first' }] })
    const w = new World(level)
    const b = book(['goblin'], ['wave:test:campaign:0'])
    const notices = new Notices(w, b)
    w.callWave()
    expect(notices.current).toBeNull()
    expect(b.met).toEqual([])
    expect(b.tips).toEqual([])
  })

  it('keep the advice of a challenge apart from that of the campaign', () => {
    const w = new World(LEVELS[0], 'normal', { mode: 'siege' })
    const b = book([], ['wave:meadow:campaign:0'])
    const notices = new Notices(w, b)
    expect(notices.current?.kind).toBe('tip')
    expect(b.tips).toEqual(['wave:meadow:siege:0'])
  })

  it('take a card down after a while and move on to the next', () => {
    const level = testLevel({ waves: [{ groups: [{ type: 'goblin', count: 1, gap: 1, at: 0 }, { type: 'orc', count: 1, gap: 1, at: 0 }] }] })
    const w = new World(level)
    const notices = new Notices(w, book())
    expect(notices.current).toBeNull()
    w.callWave()
    notices.update(NOTICE_LIFE - 1)
    expect(notices.current).toEqual<Notice>({ kind: 'enemy', type: 'goblin' })
    expect(notices.shownFor).toBe(NOTICE_LIFE - 1)
    notices.update(1.5)
    expect(notices.current).toEqual<Notice>({ kind: 'enemy', type: 'orc' })
    expect(notices.shownFor).toBe(0)
  })

  it('every enemy has a card text, and every level opens with advice', () => {
    for (const def of Object.values(ENEMIES)) expect(def.intro.length, def.type).toBeGreaterThan(20)
    for (const level of LEVELS) expect(level.waves.some((wave) => wave.tip !== undefined), level.id).toBe(true)
  })
})
