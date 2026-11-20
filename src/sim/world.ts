import { anim, animDuration, hasAnim, markerTime, sheet, type Point } from '../assets'
import { ENEMIES, type EnemyDef } from '../data/enemies'
import { type LevelDef, type WaveGroup } from '../data/levels'
import {
  HERO,
  MAGE_SLOW_FACTOR,
  MAGE_SLOW_TIME,
  MAX_LEVEL,
  RANGE_SQUASH,
  SELL_REFUND,
  SOLDIERS_PER_BARRACKS,
  SOLDIER_RESPAWN,
  SPELLS,
  TOWERS,
  towerSheet,
  type TowerType,
} from '../data/towers'
import { TILE, buildPath, nearestOnPath, samplePath, type PathData } from './path'
import type {
  DamageKind,
  Dir,
  Effect,
  EffectLayer,
  Enemy,
  FloatIcon,
  FloatText,
  GameResult,
  Plot,
  Projectile,
  ProjectileKind,
  RallyFlag,
  SimEvent,
  Soldier,
  SoldierKind,
  Spawn,
  Tower,
} from './types'

export const BUILD_TIME = 1.0
/** seconds of calm between the last spawn of a wave and the next wave */
export const WAVE_BREAK = 14
export const EARLY_CALL_GOLD_PER_SEC = 0.5
const ENGAGE_RADIUS = 56
const LEASH_RADIUS = 84
const SHAMAN_HEAL_RADIUS = 64
const SHAMAN_HEAL_CD = 5
const SOLDIER_SPEED = 55
const SOLDIER_ATK_CD = 1.0
const RALLY_OFFSETS: readonly Point[] = [
  { x: 0, y: -8 },
  { x: -11, y: 5 },
  { x: 11, y: 5 },
]

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function inRange(cx: number, cy: number, x: number, y: number, range: number): boolean {
  const dx = x - cx
  const dy = (y - cy) / RANGE_SQUASH
  return dx * dx + dy * dy <= range * range
}

function enemyAlive(e: Enemy): boolean {
  return !e.removed && e.state !== 'dying'
}

function soldierAlive(s: Soldier): boolean {
  return !s.removed && s.state !== 'dying' && s.state !== 'dead'
}

function soldierEngaged(s: Soldier): boolean {
  return s.state === 'fight' || s.state === 'attack' || s.state === 'special'
}

export function starsFor(lives: number, maxLives: number): number {
  if (lives >= Math.ceil(maxLives * 0.9)) return 3
  if (lives >= Math.ceil(maxLives * 0.4)) return 2
  return 1
}

export class World {
  readonly level: LevelDef
  readonly paths: PathData[]
  readonly plots: Plot[]
  readonly gate: Point
  readonly hero: Soldier

  enemies: Enemy[] = []
  soldiers: Soldier[] = []
  towers: Tower[] = []
  projectiles: Projectile[] = []
  effects: Effect[] = []
  floats: FloatText[] = []
  flags: RallyFlag[] = []
  events: SimEvent[] = []

  gold: number
  lives: number
  time = 0
  waveIndex = -1
  /** seconds until the next wave starts by itself; null while waiting for the player or after the last wave */
  waveTimer: number | null = null
  waveTimerMax = 1
  result: GameResult = null
  spellCd = { fire: 0, reinforce: 0 }
  kills = 0
  /** time of the most recent leak, for HUD feedback */
  leakT = -10

  private spawnQueue: Spawn[] = []
  private readonly rng: () => number
  private nextId = 1

  constructor(level: LevelDef) {
    this.level = level
    this.rng = mulberry32(level.seed * 7919 + 13)
    this.paths = level.paths.map((wp) => buildPath(wp))
    this.plots = level.plots.map(([px, py], id) => ({ id, x: Math.round(px * TILE), y: Math.round(py * TILE), tower: null }))
    this.gate = { x: level.gate[0] * TILE, y: level.gate[1] * TILE }
    this.gold = level.startGold
    this.lives = level.lives
    this.hero = this.makeSoldier('hero', level.heroStart[0] * TILE, level.heroStart[1] * TILE)
    this.soldiers.push(this.hero)
  }

  // ------------------------------------------------------------ helpers

  private rand(min: number, max: number): number {
    return min + this.rng() * (max - min)
  }

  private roll(range: readonly [number, number]): number {
    return Math.round(this.rand(range[0], range[1]))
  }

  addEffect(sheetKey: string, x: number, y: number, layer: EffectLayer = 'top'): void {
    this.effects.push({ sheet: sheetKey, x, y, t: 0, layer })
  }

  private addFloat(text: string, x: number, y: number, icon: FloatIcon): void {
    this.floats.push({ text, x, y, t: 0, icon })
  }

  get waveCount(): number {
    return this.level.waves.length
  }

  get stars(): number {
    return starsFor(this.lives, this.level.lives)
  }

  // ------------------------------------------------------------ waves

  canCallWave(): boolean {
    if (this.result !== null) return false
    if (this.waveIndex >= this.waveCount - 1) return false
    return this.waveIndex === -1 || this.waveTimer !== null
  }

  /** Gold granted if the next wave is called right now. */
  earlyBonus(): number {
    if (this.waveIndex < 0 || this.waveTimer === null) return 0
    return Math.floor(this.waveTimer * EARLY_CALL_GOLD_PER_SEC)
  }

  nextWaveGroups(): WaveGroup[] {
    const w = this.level.waves[this.waveIndex + 1]
    return w ? w.groups : []
  }

  callWave(): boolean {
    if (!this.canCallWave()) return false
    const bonus = this.earlyBonus()
    if (bonus > 0) {
      this.gold += bonus
      const start = this.paths[0].pts[0]
      this.addFloat(`+${bonus}`, Math.max(24, Math.min(744, start.x)), Math.max(40, Math.min(400, start.y)) - 20, 'coin')
      this.events.push('coin')
    }
    this.startNextWave()
    return true
  }

  private startNextWave(): void {
    this.waveIndex += 1
    const wave = this.level.waves[this.waveIndex]
    let duration = 0
    for (const grp of wave.groups) {
      const def = ENEMIES[grp.type]
      for (let i = 0; i < grp.count; i++) {
        this.spawnQueue.push({ at: this.time + grp.at + i * grp.gap, def, path: grp.path ?? 0 })
      }
      duration = Math.max(duration, grp.at + (grp.count - 1) * grp.gap)
    }
    this.spawnQueue.sort((a, b) => a.at - b.at)
    if (this.waveIndex < this.waveCount - 1) {
      this.waveTimer = duration + WAVE_BREAK
      this.waveTimerMax = this.waveTimer
    } else {
      this.waveTimer = null
    }
    this.events.push('wave')
  }

  private updateWaves(dt: number): void {
    if (this.waveTimer !== null) {
      this.waveTimer -= dt
      if (this.waveTimer <= 0) this.startNextWave()
    }
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].at <= this.time) {
      const s = this.spawnQueue.shift()
      if (s) this.spawnEnemy(s.def, s.path)
    }
  }

  spawnEnemy(def: EnemyDef, pathIndex: number, dist = 0): Enemy {
    const path = this.paths[Math.min(pathIndex, this.paths.length - 1)]
    const laneSpread = def.radius >= 10 ? 4 : 10
    const e: Enemy = {
      id: this.nextId++,
      def,
      path,
      dist,
      lane: this.rand(-laneSpread, laneSpread),
      x: 0,
      y: 0,
      hp: def.hp,
      state: 'walk',
      anim: def.flying ? 'fly' : 'walk_side',
      animT: this.rand(0, 1),
      dir: 'side',
      flip: false,
      blocker: null,
      cd: 0,
      hitDone: false,
      slowT: 0,
      healCd: this.rand(1, SHAMAN_HEAL_CD),
      age: 0,
      removed: false,
    }
    this.placeOnPath(e)
    this.enemies.push(e)
    return e
  }

  private placeOnPath(e: Enemy): void {
    const s = samplePath(e.path, e.dist)
    e.x = s.x - s.ty * e.lane
    e.y = s.y + s.tx * e.lane
    const ax = Math.abs(s.tx)
    const ay = Math.abs(s.ty)
    // hysteresis keeps the facing stable while rounding a corner
    if (e.dir === 'side' ? ay > ax * 1.3 : ay >= ax * 0.77) {
      e.dir = s.ty > 0 ? 'down' : 'up'
    } else {
      e.dir = 'side'
      e.flip = s.tx < 0
    }
  }

  // ------------------------------------------------------------ enemies

  private setEnemyAnim(e: Enemy, name: string, restart: boolean): void {
    const resolved = hasAnim(e.def.sheet, name) ? name : e.def.flying ? 'fly' : 'idle'
    if (e.anim !== resolved || restart) {
      if (restart || !(e.anim.startsWith('walk') && resolved.startsWith('walk'))) e.animT = 0
      e.anim = resolved
    }
  }

  private findOtherAttacker(e: Enemy, except: Soldier | null): Soldier | null {
    for (const s of this.soldiers) {
      if (s !== except && s.target === e && soldierAlive(s)) return s
    }
    return null
  }

  private updateEnemy(e: Enemy, dt: number): void {
    e.animT += dt
    e.age += dt
    if (e.slowT > 0) e.slowT -= dt

    switch (e.state) {
      case 'dying': {
        if (e.animT >= animDuration(anim(e.def.sheet, 'death'))) e.removed = true
        return
      }
      case 'cast': {
        const a = anim(e.def.sheet, 'attack')
        if (!e.hitDone && e.animT >= markerTime(a)) {
          e.hitDone = true
          this.shamanHeal(e)
        }
        if (e.animT >= animDuration(a)) {
          e.state = e.blocker ? 'blocked' : 'walk'
          this.setEnemyAnim(e, e.blocker ? 'idle' : `walk_${e.dir}`, true)
        }
        return
      }
      case 'attack': {
        const a = anim(e.def.sheet, 'attack')
        if (!e.hitDone && e.animT >= markerTime(a)) {
          e.hitDone = true
          const b = e.blocker
          if (b && soldierAlive(b)) {
            this.damageSoldier(b, this.roll(e.def.dmg))
            this.events.push('melee')
          }
        }
        if (e.animT >= animDuration(a)) {
          e.state = 'blocked'
          e.cd = e.def.atkCd
          this.setEnemyAnim(e, 'idle', true)
        }
        return
      }
      case 'blocked': {
        let b = e.blocker
        if (!b || !soldierAlive(b) || b.target !== e) {
          b = this.findOtherAttacker(e, null)
          e.blocker = b
        }
        if (!b) {
          e.state = 'walk'
          this.setEnemyAnim(e, `walk_${e.dir}`, true)
          return
        }
        e.flip = b.x < e.x
        e.cd -= dt
        if (e.cd <= 0 && soldierEngaged(b)) {
          e.state = 'attack'
          e.hitDone = false
          this.setEnemyAnim(e, 'attack', true)
        }
        return
      }
      case 'walk': {
        if (e.blocker) {
          e.state = 'blocked'
          this.setEnemyAnim(e, 'idle', true)
          return
        }
        if (e.def.heal !== undefined) {
          e.healCd -= dt
          if (e.healCd <= 0) {
            if (this.hasWoundedAlly(e)) {
              e.healCd = SHAMAN_HEAL_CD
              e.state = 'cast'
              e.hitDone = false
              this.setEnemyAnim(e, 'attack', true)
              return
            }
            e.healCd = 0.5
          }
        }
        const speed = e.def.speed * (e.slowT > 0 ? MAGE_SLOW_FACTOR : 1)
        e.dist += speed * dt
        if (e.dist >= e.path.length) {
          e.removed = true
          this.lives = Math.max(0, this.lives - e.def.lives)
          this.leakT = this.time
          this.addFloat(`-${e.def.lives}`, this.gate.x, this.gate.y - 60, 'heart')
          this.events.push('leak')
          return
        }
        this.placeOnPath(e)
        this.setEnemyAnim(e, e.def.flying ? 'fly' : `walk_${e.dir}`, false)
        return
      }
    }
  }

  private hasWoundedAlly(shaman: Enemy): boolean {
    for (const o of this.enemies) {
      if (!enemyAlive(o) || o.hp >= o.def.hp) continue
      if (Math.hypot(o.x - shaman.x, o.y - shaman.y) <= SHAMAN_HEAL_RADIUS) return true
    }
    return false
  }

  private shamanHeal(shaman: Enemy): void {
    const amount = shaman.def.heal ?? 0
    for (const o of this.enemies) {
      if (!enemyAlive(o) || o.hp >= o.def.hp) continue
      if (Math.hypot(o.x - shaman.x, o.y - shaman.y) > SHAMAN_HEAL_RADIUS) continue
      if (o === shaman) {
        this.healEnemy(o, amount)
        continue
      }
      this.projectiles.push({
        kind: 'heal',
        sx: shaman.x,
        sy: shaman.y - shaman.def.height,
        x: shaman.x,
        y: shaman.y - shaman.def.height,
        tx: o.x,
        ty: o.y - o.def.height * 0.5,
        target: o,
        t: 0,
        dur: 0.45,
        arc: 14,
        dmg: amount,
        dmgKind: 'true',
        splash: 0,
        slow: false,
        angle: 0,
        removed: false,
      })
    }
    this.events.push('heal')
  }

  private healEnemy(e: Enemy, amount: number): void {
    e.hp = Math.min(e.def.hp, e.hp + amount)
    this.addEffect('effects/heal', e.x, e.y)
  }

  damageEnemy(e: Enemy, amount: number, kind: DamageKind): void {
    if (!enemyAlive(e)) return
    const mult = kind === 'physical' ? 1 - e.def.armor : kind === 'magic' ? 1 - e.def.magicRes : 1
    e.hp -= amount * mult
    if (e.hp <= 0) this.killEnemy(e)
  }

  private killEnemy(e: Enemy): void {
    e.hp = 0
    e.state = 'dying'
    e.anim = 'death'
    e.animT = 0
    e.blocker = null
    this.kills += 1
    this.gold += e.def.gold
    const top = e.y - e.def.height
    this.addFloat(`+${e.def.gold}`, e.x, top, 'coin')
    this.addEffect('effects/soul', e.x, e.y - e.def.height * 0.5)
    this.events.push(e.def.boss ? 'boss_kill' : 'kill')
  }

  // ------------------------------------------------------------ soldiers

  private makeSoldier(kind: SoldierKind, x: number, y: number): Soldier {
    const isHero = kind === 'hero'
    const b = TOWERS.barracks
    const hp = isHero ? HERO.hp : kind === 'reinforcement' ? SPELLS.reinforce.hp : b.soldierHp[0]
    return {
      id: this.nextId++,
      kind,
      sheet: isHero ? HERO.sheet : 'units/soldier',
      x,
      y,
      home: { x, y },
      hp,
      maxHp: hp,
      dmg: isHero ? HERO.dmg : kind === 'reinforcement' ? SPELLS.reinforce.dmg : b.dmg[0],
      armor: isHero ? HERO.armor : b.soldierArmor[0],
      atkCd: isHero ? HERO.atkCd : SOLDIER_ATK_CD,
      speed: isHero ? HERO.speed : SOLDIER_SPEED,
      state: 'idle',
      anim: 'idle',
      animT: 0,
      flip: false,
      target: null,
      side: -1,
      slotDy: 0,
      cd: 0,
      hitDone: false,
      idleT: 0,
      life: kind === 'reinforcement' ? SPELLS.reinforce.life : Infinity,
      respawnT: 0,
      specialCd: isHero ? HERO.specialCd * 0.5 : Infinity,
      forced: false,
      removed: false,
    }
  }

  private setSoldierAnim(s: Soldier, name: string, restart = false): void {
    if (s.anim !== name || restart) {
      if (restart || !(s.anim.startsWith('walk') && name.startsWith('walk'))) s.animT = 0
      s.anim = name
    }
  }

  private releaseTarget(s: Soldier): void {
    const e = s.target
    s.target = null
    if (e && e.blocker === s) e.blocker = this.findOtherAttacker(e, s)
  }

  private acquireTarget(s: Soldier): void {
    let free: Enemy | null = null
    let freeRemaining = Infinity
    let busy: Enemy | null = null
    let busyDist = Infinity
    for (const e of this.enemies) {
      if (!enemyAlive(e) || e.def.flying) continue
      const d = Math.hypot(e.x - s.home.x, e.y - s.home.y)
      if (d > ENGAGE_RADIUS) continue
      if (!e.blocker) {
        const remaining = e.path.length - e.dist
        if (remaining < freeRemaining) {
          freeRemaining = remaining
          free = e
        }
      } else if (d < busyDist) {
        busyDist = d
        busy = e
      }
    }
    const e = free ?? busy
    if (!e) return
    s.target = e
    s.side = s.x <= e.x ? -1 : 1
    if (!e.blocker) {
      e.blocker = s
      s.slotDy = 0
    } else {
      s.slotDy = s.id % 2 === 0 ? 5 : -5
    }
  }

  /** Moves the unit toward a point. Returns true once it stands on it. */
  private moveToward(s: Soldier, x: number, y: number, dt: number): boolean {
    const dx = x - s.x
    const dy = y - s.y
    const d = Math.hypot(dx, dy)
    const step = s.speed * dt
    if (d <= Math.max(step, 0.75)) {
      s.x = x
      s.y = y
      return true
    }
    s.x += (dx / d) * step
    s.y += (dy / d) * step
    s.state = 'move'
    if (Math.abs(dx) >= Math.abs(dy) * 0.8) {
      s.flip = dx < 0
      this.setSoldierAnim(s, 'walk_side')
    } else {
      this.setSoldierAnim(s, dy > 0 ? 'walk_down' : 'walk_up')
    }
    return false
  }

  private updateSoldier(s: Soldier, dt: number): void {
    s.animT += dt
    if (s.state === 'dead') {
      if (s.kind === 'hero') {
        s.respawnT -= dt
        if (s.respawnT <= 0) {
          s.hp = s.maxHp
          s.x = s.home.x
          s.y = s.home.y
          s.state = 'idle'
          s.forced = false
          this.setSoldierAnim(s, 'idle', true)
          this.addEffect('effects/hero_respawn', s.x, s.y)
          this.events.push('hero_up')
        }
      }
      return
    }
    if (s.state === 'dying') {
      if (s.animT >= animDuration(anim(s.sheet, 'death'))) {
        s.state = 'dead'
        if (s.kind === 'hero') s.respawnT = HERO.respawn
        else if (s.kind === 'reinforcement') s.removed = true
      }
      return
    }
    if (s.life !== Infinity) {
      s.life -= dt
      if (s.life <= 0) {
        this.killSoldier(s)
        return
      }
    }
    s.cd -= dt
    s.specialCd -= dt

    const tgt = s.target
    if (tgt && (!enemyAlive(tgt) || Math.hypot(tgt.x - s.home.x, tgt.y - s.home.y) > LEASH_RADIUS)) {
      this.releaseTarget(s)
    }

    if (s.state === 'attack' || s.state === 'special') {
      const a = anim(s.sheet, s.state)
      if (!s.hitDone && s.animT >= (s.state === 'attack' ? markerTime(a) : animDuration(a) * 0.55)) {
        s.hitDone = true
        if (s.state === 'special') this.heroSpecial(s)
        else if (s.target && enemyAlive(s.target)) {
          this.damageEnemy(s.target, this.roll(s.dmg), 'physical')
          this.events.push('melee')
        }
      }
      if (s.animT >= animDuration(a)) {
        s.state = 'fight'
        s.cd = s.atkCd
        this.setSoldierAnim(s, 'idle', true)
      }
      return
    }

    if (!s.target && !s.forced) this.acquireTarget(s)

    const e = s.target
    if (e) {
      const gx = e.x + s.side * (e.def.radius + 9)
      const gy = e.y + s.slotDy
      if (this.moveToward(s, gx, gy, dt)) {
        s.state = 'fight'
        s.idleT = 0
        s.flip = e.x < s.x
        if (s.cd <= 0) {
          s.hitDone = false
          if (s.kind === 'hero' && s.specialCd <= 0) {
            s.state = 'special'
            s.specialCd = HERO.specialCd
            this.setSoldierAnim(s, 'special', true)
          } else {
            s.state = 'attack'
            this.setSoldierAnim(s, 'attack', true)
          }
        } else if (s.anim !== 'idle') {
          this.setSoldierAnim(s, 'idle', true)
        }
      }
      return
    }

    if (this.moveToward(s, s.home.x, s.home.y, dt)) {
      if (s.state !== 'idle') {
        s.state = 'idle'
        this.setSoldierAnim(s, 'idle', true)
      }
      s.forced = false
      s.idleT += dt
      if (s.idleT > 2 && s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.08 * dt)
    }
  }

  private heroSpecial(hero: Soldier): void {
    for (const e of this.enemies) {
      if (!enemyAlive(e) || e.def.flying) continue
      if (Math.hypot(e.x - hero.x, e.y - hero.y) > HERO.specialRadius) continue
      this.damageEnemy(e, HERO.specialDmg, 'magic')
      this.addEffect('effects/magic_hit', e.x, e.y - e.def.height * 0.5)
    }
    hero.hp = Math.min(hero.maxHp, hero.hp + hero.maxHp * HERO.specialHeal)
    this.addEffect('effects/heal', hero.x, hero.y)
    this.events.push('hero_special')
  }

  damageSoldier(s: Soldier, amount: number): void {
    if (!soldierAlive(s)) return
    s.hp -= amount * (1 - s.armor)
    s.idleT = 0
    if (s.hp <= 0) this.killSoldier(s)
  }

  private killSoldier(s: Soldier): void {
    s.hp = 0
    this.releaseTarget(s)
    s.state = 'dying'
    this.setSoldierAnim(s, 'death', true)
    this.events.push(s.kind === 'hero' ? 'hero_down' : 'soldier_down')
  }

  /** Orders the hero to walk to a spot. */
  moveHero(x: number, y: number): boolean {
    const h = this.hero
    if (this.result !== null) return false
    h.home = { x, y }
    if (!soldierAlive(h)) return true // will respawn at the new spot
    this.releaseTarget(h)
    h.forced = true
    if (h.state === 'fight' || h.state === 'idle') h.state = 'move'
    return true
  }

  // ------------------------------------------------------------ towers

  towerRange(t: Tower): number {
    return TOWERS[t.type].range[t.level]
  }

  upgradeCost(t: Tower): number | null {
    return t.level < MAX_LEVEL ? TOWERS[t.type].cost[t.level + 1] : null
  }

  sellValue(t: Tower): number {
    return Math.floor(t.invested * SELL_REFUND)
  }

  canBuild(plot: Plot, type: TowerType): boolean {
    return (
      this.result === null &&
      plot.tower === null &&
      this.level.towers.includes(type) &&
      this.gold >= TOWERS[type].cost[0]
    )
  }

  build(plotId: number, type: TowerType): Tower | null {
    const plot = this.plots[plotId]
    if (!plot || !this.canBuild(plot, type)) return null
    const def = TOWERS[type]
    this.gold -= def.cost[0]
    const unitCount = sheet(towerSheet(type, 0)).unitSlots.length
    const t: Tower = {
      id: this.nextId++,
      plot,
      type,
      level: 0,
      x: plot.x,
      y: plot.y,
      invested: def.cost[0],
      buildT: BUILD_TIME,
      cd: 0.3,
      animT: 0,
      attackT: -1,
      shot: null,
      units: Array.from({ length: unitCount }, () => ({ shootT: -1, dir: 'down' as Dir, flip: false })),
      nextUnit: 0,
      slots: [],
      rally: this.defaultRally(plot.x, plot.y),
      doorT: -1,
      doorSlot: 0,
      doorSpawned: false,
    }
    if (type === 'barracks') {
      for (let i = 0; i < SOLDIERS_PER_BARRACKS; i++) t.slots.push({ soldier: null, respawnT: i * 0.5 })
    }
    plot.tower = t
    this.towers.push(t)
    this.events.push('build')
    return t
  }

  private defaultRally(x: number, y: number): Point {
    let best: Point = { x, y }
    let bestD = Infinity
    for (const p of this.paths) {
      const n = nearestOnPath(p, x, y)
      if (n.d < bestD) {
        bestD = n.d
        best = { x: n.x, y: n.y }
      }
    }
    return best
  }

  upgrade(t: Tower): boolean {
    const cost = this.upgradeCost(t)
    if (this.result !== null || cost === null || t.buildT > 0 || this.gold < cost) return false
    this.gold -= cost
    t.invested += cost
    t.level += 1
    this.addEffect('effects/upgrade_sparkle', t.x, t.y)
    if (t.type === 'barracks') {
      for (const slot of t.slots) {
        if (slot.soldier) this.applyBarracksStats(slot.soldier, t.level, true)
      }
    }
    this.events.push('upgrade')
    return true
  }

  sell(t: Tower): boolean {
    if (this.result !== null || t.plot.tower !== t) return false
    const value = this.sellValue(t)
    this.gold += value
    for (const slot of t.slots) {
      if (slot.soldier) {
        this.releaseTarget(slot.soldier)
        slot.soldier.removed = true
      }
    }
    t.plot.tower = null
    this.towers = this.towers.filter((o) => o !== t)
    this.addEffect('effects/smoke_puff', t.x, t.y - 8)
    this.addFloat(`+${value}`, t.x, t.y - 40, 'coin')
    this.events.push('sell')
    return true
  }

  canRally(t: Tower, x: number, y: number): boolean {
    return t.type === 'barracks' && inRange(t.x, t.y, x, y, this.towerRange(t))
  }

  setRally(t: Tower, x: number, y: number): boolean {
    if (this.result !== null || !this.canRally(t, x, y)) return false
    t.rally = { x, y }
    t.slots.forEach((slot, i) => {
      const s = slot.soldier
      if (!s) return
      this.releaseTarget(s)
      s.home = { x: x + RALLY_OFFSETS[i].x, y: y + RALLY_OFFSETS[i].y }
    })
    this.flags.push({ x, y, t: 0 })
    return true
  }

  private applyBarracksStats(s: Soldier, level: number, heal: boolean): void {
    const def = TOWERS.barracks
    s.maxHp = def.soldierHp[level]
    s.dmg = def.dmg[level]
    s.armor = def.soldierArmor[level]
    if (heal) s.hp = s.maxHp
  }

  private updateBarracks(t: Tower, dt: number): void {
    for (const slot of t.slots) {
      const s = slot.soldier
      if (s && s.state === 'dead') {
        s.removed = true
        slot.soldier = null
        slot.respawnT = SOLDIER_RESPAWN
      }
      if (!slot.soldier) slot.respawnT -= dt
    }
    const key = towerSheet(t.type, t.level)
    const door = anim(key, 'door')
    if (t.doorT < 0) {
      const idx = t.slots.findIndex((sl) => !sl.soldier && sl.respawnT <= 0)
      if (idx >= 0) {
        t.doorT = 0
        t.doorSlot = idx
        t.doorSpawned = false
      }
      return
    }
    t.doorT += dt
    if (!t.doorSpawned && t.doorT >= markerTime(door)) {
      t.doorSpawned = true
      const sh = sheet(key)
      const sp = sh.spawnPoint ?? { x: sh.ax, y: sh.ay }
      const s = this.makeSoldier('soldier', t.x - sh.ax + sp.x, t.y - sh.ay + sp.y + 8)
      this.applyBarracksStats(s, t.level, true)
      const off = RALLY_OFFSETS[t.doorSlot]
      s.home = { x: t.rally.x + off.x, y: t.rally.y + off.y }
      t.slots[t.doorSlot].soldier = s
      this.soldiers.push(s)
    }
    if (t.doorT >= animDuration(door)) t.doorT = -1
  }

  private findTarget(x: number, y: number, range: number, air: boolean): Enemy | null {
    let best: Enemy | null = null
    let bestRemaining = Infinity
    for (const e of this.enemies) {
      if (!enemyAlive(e) || (e.def.flying && !air)) continue
      if (!inRange(x, y, e.x, e.y, range)) continue
      const remaining = e.path.length - e.dist
      if (remaining < bestRemaining) {
        bestRemaining = remaining
        best = e
      }
    }
    return best
  }

  private updateShooter(t: Tower, dt: number): void {
    const def = TOWERS[t.type]
    const key = towerSheet(t.type, t.level)
    t.cd -= dt
    if (t.attackT >= 0) {
      t.attackT += dt
      if (t.attackT >= animDuration(anim(key, 'attack'))) t.attackT = -1
    }
    for (const u of t.units) {
      if (u.shootT < 0) continue
      u.shootT += dt
      const unitAnim = t.type === 'archer' ? anim('units/archer_unit', 'shoot_side') : anim('units/mage_unit', 'cast')
      if (u.shootT >= animDuration(unitAnim)) u.shootT = -1
    }

    const shot = t.shot
    if (shot) {
      shot.t += dt
      if (!shot.fired && shot.t >= shot.release) {
        shot.fired = true
        let target: Enemy | null = shot.target
        if (!enemyAlive(target)) target = this.findTarget(t.x, t.y, def.range[t.level], t.type !== 'artillery')
        if (target) this.fire(t, target, shot.unit)
        else t.cd = Math.min(t.cd, 0.15)
      }
      if (shot.t >= shot.dur) t.shot = null
      return
    }

    if (t.cd > 0) return
    const target = this.findTarget(t.x, t.y, def.range[t.level], t.type !== 'artillery')
    if (!target) return
    t.cd = def.cooldown[t.level]
    let release: number
    let dur: number
    let unit = 0
    if (t.type === 'archer') {
      const a = anim('units/archer_unit', 'shoot_side')
      release = markerTime(a)
      dur = animDuration(a)
      unit = t.nextUnit
      t.nextUnit = (t.nextUnit + 1) % Math.max(1, t.units.length)
    } else {
      const a = anim(key, 'attack')
      release = markerTime(a)
      dur = animDuration(a)
      t.attackT = 0
    }
    const u = t.units[unit]
    if (u) {
      u.shootT = 0
      const dx = target.x - t.x
      const dy = target.y - (t.y - 30)
      if (Math.abs(dx) >= Math.abs(dy) * 0.7) {
        u.dir = 'side'
        u.flip = dx < 0
      } else {
        u.dir = dy > 0 ? 'down' : 'up'
      }
    }
    t.shot = { target, t: 0, release, dur, fired: false, unit }
  }

  private fire(t: Tower, target: Enemy, unit: number): void {
    const def = TOWERS[t.type]
    const key = towerSheet(t.type, t.level)
    const sh = sheet(key)
    const ox = t.x - sh.ax
    const oy = t.y - sh.ay
    const dmg = this.roll(def.dmg[t.level])
    const hitY = target.y - target.def.height * 0.5
    if (t.type === 'archer') {
      const slot = sh.unitSlots[unit] ?? { x: sh.ax, y: 24 }
      const sx = ox + slot.x
      const sy = oy + slot.y - 7
      const d = Math.hypot(target.x - sx, hitY - sy)
      this.spawnProjectile('arrow', sx, sy, target.x, hitY, target, Math.max(0.12, d / 300), d * 0.12, dmg, 'physical')
      this.events.push('arrow')
    } else if (t.type === 'mage') {
      const slot = sh.unitSlots[0] ?? { x: sh.ax, y: 24 }
      const sx = ox + slot.x
      const sy = oy + slot.y - 20
      const d = Math.hypot(target.x - sx, hitY - sy)
      const p = this.spawnProjectile('bolt', sx, sy, target.x, hitY, target, Math.max(0.12, d / 230), 0, dmg, 'magic')
      p.slow = t.level >= MAX_LEVEL
      this.events.push('bolt')
    } else {
      const origin = sh.projectileOrigin ?? { x: sh.ax, y: 24 }
      const sx = ox + origin.x
      const sy = oy + origin.y
      const flight = 0.75 + Math.hypot(target.x - sx, target.y - sy) / 500
      // lead the shot: aim where a walking target will be when the bomb lands
      let tx = target.x
      let ty = target.y
      if (target.state === 'walk') {
        const speed = target.def.speed * (target.slowT > 0 ? MAGE_SLOW_FACTOR : 1)
        const ahead = samplePath(target.path, Math.min(target.path.length, target.dist + speed * flight))
        tx = ahead.x - ahead.ty * target.lane
        ty = ahead.y + ahead.tx * target.lane
      }
      const p = this.spawnProjectile('bomb', sx, sy, tx, ty, null, flight, 46, dmg, 'physical')
      p.splash = def.splash[t.level]
      this.addEffect('effects/smoke_puff', sx, sy + 8)
      this.events.push('cannon')
    }
  }

  private spawnProjectile(
    kind: ProjectileKind,
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    target: Enemy | null,
    dur: number,
    arc: number,
    dmg: number,
    dmgKind: DamageKind,
  ): Projectile {
    const p: Projectile = {
      kind, sx, sy, x: sx, y: sy, tx, ty, target, t: 0, dur, arc, dmg, dmgKind,
      splash: 0, slow: false, angle: Math.atan2(ty - sy, tx - sx), removed: false,
    }
    this.projectiles.push(p)
    return p
  }

  private updateTower(t: Tower, dt: number): void {
    t.animT += dt
    if (t.buildT > 0) {
      t.buildT -= dt
      if (t.buildT <= 0) this.addEffect('effects/dust', t.x, t.y)
      return
    }
    if (t.type === 'barracks') this.updateBarracks(t, dt)
    else this.updateShooter(t, dt)
  }

  // ------------------------------------------------------------ projectiles

  private updateProjectile(p: Projectile, dt: number): void {
    p.t += dt
    if (p.t < 0) return
    const tgt = p.target
    if (tgt) {
      if (enemyAlive(tgt)) {
        p.tx = tgt.x
        p.ty = tgt.y - tgt.def.height * 0.5
      } else {
        p.target = null
        // an arrow whose target died drops to the ground where it stood
        if (p.kind === 'arrow') p.ty += tgt.def.height * 0.5
      }
    }
    const k = Math.min(1, p.t / p.dur)
    const nx = p.sx + (p.tx - p.sx) * k
    const ny = p.sy + (p.ty - p.sy) * k - p.arc * 4 * k * (1 - k)
    if (nx !== p.x || ny !== p.y) p.angle = Math.atan2(ny - p.y, nx - p.x)
    p.x = nx
    p.y = ny
    if (k >= 1) this.impact(p, tgt)
  }

  private impact(p: Projectile, hadTarget: Enemy | null): void {
    p.removed = true
    const target = p.target
    switch (p.kind) {
      case 'arrow':
        if (target) {
          this.damageEnemy(target, p.dmg, p.dmgKind)
          this.addEffect('effects/hit_spark', p.x, p.y)
          this.events.push('hit')
        }
        break
      case 'bolt':
        if (target) {
          this.damageEnemy(target, p.dmg, p.dmgKind)
          if (p.slow && enemyAlive(target)) target.slowT = MAGE_SLOW_TIME
        }
        if (target || hadTarget) {
          this.addEffect('effects/magic_hit', p.x, p.y)
          this.events.push('magic_hit')
        }
        break
      case 'heal':
        if (target) this.healEnemy(target, p.dmg)
        break
      case 'bomb':
      case 'fireball': {
        this.addEffect('effects/explosion', p.tx, p.ty + 4)
        this.events.push('explosion')
        const hitsAir = p.kind === 'fireball'
        for (const e of this.enemies) {
          if (!enemyAlive(e) || (e.def.flying && !hitsAir)) continue
          const d = Math.hypot(e.x - p.tx, (e.y - p.ty) / RANGE_SQUASH)
          const reach = p.splash + e.def.radius
          if (d > reach) continue
          this.damageEnemy(e, p.dmg * (1 - 0.5 * Math.min(1, d / reach)), p.dmgKind)
        }
        break
      }
    }
  }

  // ------------------------------------------------------------ spells

  castFireRain(x: number, y: number): boolean {
    if (this.result !== null || this.spellCd.fire > 0) return false
    const spec = SPELLS.fire
    this.spellCd.fire = spec.cooldown
    for (let i = 0; i < spec.count; i++) {
      const tx = i === 0 ? x : x + this.rand(-spec.scatter, spec.scatter)
      const ty = i === 0 ? y : y + this.rand(-spec.scatter, spec.scatter) * RANGE_SQUASH
      const p = this.spawnProjectile('fireball', tx - 70, ty - 240, tx, ty, null, 0.45, 0, this.roll(spec.dmg), 'true')
      p.splash = spec.radius
      p.t = -i * 0.16
    }
    this.events.push('spell_fire')
    return true
  }

  castReinforcements(x: number, y: number): boolean {
    if (this.result !== null || this.spellCd.reinforce > 0) return false
    const spec = SPELLS.reinforce
    this.spellCd.reinforce = spec.cooldown
    // call them onto the road when the player clicks beside it
    let px = x
    let py = y
    let bestD = Infinity
    for (const path of this.paths) {
      const n = nearestOnPath(path, x, y)
      if (n.d < bestD) {
        bestD = n.d
        if (n.d > 26) {
          px = n.x
          py = n.y
        } else {
          px = x
          py = y
        }
      }
    }
    for (let i = 0; i < spec.count; i++) {
      const ox = (i - (spec.count - 1) / 2) * 16
      const s = this.makeSoldier('reinforcement', px + ox, py)
      this.soldiers.push(s)
      this.addEffect('effects/dust', s.x, s.y)
    }
    this.events.push('spell_reinforce')
    return true
  }

  // ------------------------------------------------------------ main loop

  update(dt: number): void {
    // visual leftovers keep animating after the battle is decided
    for (const fx of this.effects) fx.t += dt
    this.effects = this.effects.filter((fx) => fx.t < animDuration(anim(fx.sheet, 'play')))
    for (const f of this.floats) f.t += dt
    this.floats = this.floats.filter((f) => f.t < 1)
    for (const f of this.flags) f.t += dt
    this.flags = this.flags.filter((f) => f.t < 2.5)

    if (this.result !== null) {
      for (const e of this.enemies) if (e.state === 'dying') this.updateEnemy(e, dt)
      this.enemies = this.enemies.filter((e) => !e.removed)
      return
    }

    this.time += dt
    this.spellCd.fire = Math.max(0, this.spellCd.fire - dt)
    this.spellCd.reinforce = Math.max(0, this.spellCd.reinforce - dt)

    this.updateWaves(dt)
    for (const e of this.enemies) this.updateEnemy(e, dt)
    for (const s of this.soldiers) this.updateSoldier(s, dt)
    for (const t of this.towers) this.updateTower(t, dt)
    for (const p of this.projectiles) this.updateProjectile(p, dt)

    this.enemies = this.enemies.filter((e) => !e.removed)
    this.soldiers = this.soldiers.filter((s) => !s.removed)
    this.projectiles = this.projectiles.filter((p) => !p.removed)

    if (this.lives <= 0) {
      this.result = 'lose'
      this.events.push('lose')
    } else if (
      this.waveIndex >= this.waveCount - 1 &&
      this.spawnQueue.length === 0 &&
      this.enemies.length === 0
    ) {
      this.result = 'win'
      this.events.push('win')
    }
  }

  /** Enemies still waiting to enter the field in already started waves. */
  get pendingSpawns(): number {
    return this.spawnQueue.length
  }
}
