import { anim, animDuration, hasAnim, markerTime, sheet, type Point } from '../assets'
import { ENEMIES, abilityOf, type EnemyAbility, type EnemyDef } from '../data/enemies'
import { type LevelDef, type WaveGroup } from '../data/levels'
import {
  FROST_SLOW,
  HERO,
  MAGE_SLOW_FACTOR,
  MAGE_SLOW_TIME,
  MARKSMAN_PIERCE,
  MAX_LEVEL,
  MAX_SKILL_RANK,
  RANGE_SQUASH,
  SELL_REFUND,
  SKILLS,
  SOLDIERS_PER_BARRACKS,
  SOLDIER_ATK_CD,
  SOLDIER_RESPAWN,
  SPECS,
  SPELLS,
  STUN_IMMUNITY,
  TOWERS,
  towerSheet,
  towerStats,
  type SkillId,
  type SpecId,
  type TowerStats,
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
  HitMods,
  Plot,
  Projectile,
  ProjectileKind,
  RallyFlag,
  SimEvent,
  Soldier,
  SoldierKind,
  Spawn,
  Tower,
  Zone,
} from './types'

export const BUILD_TIME = 1.0
/** seconds of calm between the last spawn of a wave and the next wave */
export const WAVE_BREAK = 14
export const EARLY_CALL_GOLD_PER_SEC = 0.5
const ENGAGE_RADIUS = 56
const LEASH_RADIUS = 84
const SOLDIER_SPEED = 55
/** seconds before an enemy looks again for a chance to use an ability that had no target */
const ABILITY_RETRY = 0.4
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
  zones: Zone[] = []
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
    return this.spawnOn(def, this.paths[Math.min(pathIndex, this.paths.length - 1)], dist)
  }

  private spawnOn(def: EnemyDef, path: PathData, dist: number): Enemy {
    const laneSpread = def.radius >= 10 ? 4 : 10
    const abilities = def.abilities ?? []
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
      slowFactor: 1,
      poisonT: 0,
      poisonDps: 0,
      stunT: 0,
      stunGuard: 0,
      shred: 0,
      hasteT: 0,
      hasteMult: 1,
      enraged: false,
      hurtT: 99,
      hitAt: -1,
      // passive abilities never come off cooldown
      abilityCd: abilities.map((a) => ('cooldown' in a ? this.rand(1, a.cooldown) : Infinity)),
      castsLeft: abilities.map((a) => (a.kind === 'summon' ? a.casts : 0)),
      casting: -1,
      aim: null,
      hex: null,
      summoned: false,
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

  /** Current walking speed, with every slow, aura and rage applied. */
  enemySpeed(e: Enemy): number {
    let speed = e.def.speed
    if (e.slowT > 0) speed *= e.slowFactor
    if (e.hasteT > 0) speed *= e.hasteMult
    if (e.enraged) speed *= abilityOf(e.def, 'enrage')?.speed ?? 1
    return speed
  }

  /** Timers, damage over time and the abilities that need no casting. */
  private tickStatus(e: Enemy, dt: number): void {
    e.hurtT += dt
    if (e.slowT > 0) e.slowT -= dt
    if (e.hasteT > 0) e.hasteT -= dt
    if (e.stunGuard > 0) e.stunGuard -= dt
    if (e.stunT > 0) e.stunT -= dt
    if (e.poisonT > 0) {
      const step = Math.min(dt, e.poisonT)
      e.poisonT -= dt
      this.damageEnemy(e, e.poisonDps * step, 'true', 0, true)
      if (!enemyAlive(e)) return
    }
    const list = e.def.abilities
    if (!list) return
    for (let i = 0; i < list.length; i++) {
      const a = list[i]
      e.abilityCd[i] -= dt
      switch (a.kind) {
        case 'regen':
          if (e.hurtT >= a.delay && e.hp < e.def.hp) e.hp = Math.min(e.def.hp, e.hp + a.perSec * dt)
          break
        case 'enrage':
          if (!e.enraged && e.hp <= e.def.hp * a.below) {
            e.enraged = true
            this.addEffect('effects/smoke_puff', e.x, e.y - e.def.height * 0.5)
            this.events.push('enrage')
          }
          break
        case 'haste':
          for (const o of this.enemies) {
            if (o === e || !enemyAlive(o) || Math.hypot(o.x - e.x, o.y - e.y) > a.radius) continue
            o.hasteMult = o.hasteT > 0 ? Math.max(o.hasteMult, a.speed) : a.speed
            o.hasteT = 0.5
          }
          break
        default:
          break
      }
    }
  }

  private updateEnemy(e: Enemy, dt: number): void {
    e.age += dt
    if (e.state === 'dying') {
      e.animT += dt
      if (e.animT >= animDuration(anim(e.def.sheet, 'death'))) e.removed = true
      return
    }
    this.tickStatus(e, dt)
    if (!enemyAlive(e)) return
    // frozen solid: neither the body nor its animation moves
    if (e.stunT > 0) return
    e.animT += dt

    switch (e.state) {
      case 'cast': {
        const a = anim(e.def.sheet, 'attack')
        if (!e.hitDone && e.animT >= markerTime(a)) {
          e.hitDone = true
          this.resolveCast(e)
        }
        if (e.animT >= animDuration(a)) {
          e.casting = -1
          e.aim = null
          e.hex = null
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
            const rage = e.enraged ? (abilityOf(e.def, 'enrage')?.dmg ?? 1) : 1
            this.damageSoldier(b, this.roll(e.def.dmg) * rage)
            this.events.push('melee')
            const thorns = b.owner ? this.skillRank(b.owner, 'thorns') : 0
            if (thorns > 0) {
              this.damageEnemy(e, SKILLS.thorns.dmg[thorns - 1], 'true')
              if (!enemyAlive(e)) return
            }
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
        if (this.tryCast(e)) return
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
        if (this.tryCast(e)) return
        e.dist += this.enemySpeed(e) * dt
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

  // ------------------------------------------------------------ enemy abilities

  /**
   * Seconds of cooldown the ability goes on if the enemy can use it right now,
   * otherwise null. Remembers what the cast is aimed at.
   */
  private castReady(e: Enemy, a: EnemyAbility, index: number): number | null {
    switch (a.kind) {
      case 'heal':
        // pinning a healer down in melee is the way to stop it
        return e.state === 'walk' && this.hasWoundedAlly(e, a.radius) ? a.cooldown : null
      case 'ranged': {
        e.aim = this.nearestSoldier(e.x, e.y, a.range)
        return e.aim ? a.cooldown : null
      }
      case 'summon':
        // not while still off the map or on the doorstep of the gate
        return e.castsLeft[index] > 0 && e.dist > 48 && e.dist < e.path.length - 48 ? a.cooldown : null
      case 'disable':
        e.hex = this.towerToHex(e.x, e.y, a.range)
        return e.hex ? a.cooldown : null
      case 'quake':
        return this.nearestSoldier(e.x, e.y, a.radius) ? a.cooldown : null
      default:
        return null
    }
  }

  /** Starts the cast animation of the first ability that is off cooldown and has a use. */
  private tryCast(e: Enemy): boolean {
    const list = e.def.abilities
    if (!list) return false
    for (let i = 0; i < list.length; i++) {
      if (e.abilityCd[i] > 0) continue
      const cooldown = this.castReady(e, list[i], i)
      if (cooldown === null) {
        e.abilityCd[i] = ABILITY_RETRY
        continue
      }
      e.abilityCd[i] = cooldown
      e.casting = i
      e.state = 'cast'
      e.hitDone = false
      if (e.aim) e.flip = e.aim.x < e.x
      this.setEnemyAnim(e, 'attack', true)
      return true
    }
    return false
  }

  /** The cast animation reached its marker frame: the ability takes effect. */
  private resolveCast(e: Enemy): void {
    const a = e.def.abilities?.[e.casting]
    if (!a) return
    switch (a.kind) {
      case 'heal':
        this.castHeal(e, a.amount, a.radius)
        break
      case 'ranged': {
        const s = e.aim
        if (!s || !soldierAlive(s)) break
        const sy = e.y - e.def.height * 0.6
        const d = Math.hypot(s.x - e.x, s.y - 12 - sy)
        const p = this.spawnProjectile('arrow', e.x, sy, s.x, s.y - 12, null, Math.max(0.12, d / 260), d * 0.12, this.roll(a.dmg), 'physical')
        p.soldier = s
        this.events.push('arrow')
        break
      }
      case 'summon': {
        e.castsLeft[e.casting] -= 1
        const def = ENEMIES[a.type]
        for (let i = 0; i < a.count; i++) {
          const dist = Math.max(0, Math.min(e.path.length - 1, e.dist + this.rand(-16, 16)))
          const child = this.spawnOn(def, e.path, dist)
          child.summoned = true
          this.addEffect('effects/dust', child.x, child.y)
        }
        this.events.push('summon')
        break
      }
      case 'disable': {
        const t = e.hex
        if (!t || t.plot.tower !== t) break
        t.silenceT = a.time
        t.shot = null
        this.addEffect('effects/magic_hit', t.x, t.y - 30)
        this.events.push('silence')
        break
      }
      case 'quake': {
        for (const s of this.soldiers) {
          if (soldierAlive(s) && Math.hypot(s.x - e.x, s.y - e.y) <= a.radius) this.damageSoldier(s, this.roll(a.dmg))
        }
        this.addEffect('effects/dust', e.x - 14, e.y + 2)
        this.addEffect('effects/dust', e.x + 14, e.y + 2)
        this.events.push('quake')
        break
      }
      default:
        break
    }
  }

  private hasWoundedAlly(healer: Enemy, radius: number): boolean {
    for (const o of this.enemies) {
      if (!enemyAlive(o) || o.hp >= o.def.hp) continue
      if (Math.hypot(o.x - healer.x, o.y - healer.y) <= radius) return true
    }
    return false
  }

  private castHeal(healer: Enemy, amount: number, radius: number): void {
    for (const o of this.enemies) {
      if (!enemyAlive(o) || o.hp >= o.def.hp) continue
      if (Math.hypot(o.x - healer.x, o.y - healer.y) > radius) continue
      if (o === healer) {
        this.healEnemy(o, amount)
        continue
      }
      const sy = healer.y - healer.def.height
      const p = this.spawnProjectile('heal', healer.x, sy, o.x, o.y - o.def.height * 0.5, o, 0.45, 14, amount, 'true')
      p.angle = 0
    }
    this.events.push('heal')
  }

  private nearestSoldier(x: number, y: number, range: number): Soldier | null {
    let best: Soldier | null = null
    let bestD = range
    for (const s of this.soldiers) {
      if (!soldierAlive(s)) continue
      const d = Math.hypot(s.x - x, s.y - y)
      if (d <= bestD) {
        bestD = d
        best = s
      }
    }
    return best
  }

  /** The closest shooting tower that is finished and not already hexed. */
  private towerToHex(x: number, y: number, range: number): Tower | null {
    let best: Tower | null = null
    let bestD = range
    for (const t of this.towers) {
      if (t.type === 'barracks' || t.buildT > 0 || t.silenceT > 0) continue
      const d = Math.hypot(t.x - x, t.y - y)
      if (d <= bestD) {
        bestD = d
        best = t
      }
    }
    return best
  }

  private healEnemy(e: Enemy, amount: number): void {
    e.hp = Math.min(e.def.hp, e.hp + amount)
    this.addEffect('effects/heal', e.x, e.y)
  }

  /**
   * pierce is the fraction of armor the hit ignores. Damage over time (dot)
   * does not count as a visible hit.
   */
  damageEnemy(e: Enemy, amount: number, kind: DamageKind, pierce = 0, dot = false): void {
    if (!enemyAlive(e)) return
    const armor = Math.max(0, e.def.armor - e.shred) * (1 - pierce)
    const mult = kind === 'physical' ? 1 - armor : kind === 'magic' ? 1 - e.def.magicRes : 1
    e.hp -= amount * mult
    e.hurtT = 0
    if (!dot) e.hitAt = this.time
    if (e.hp <= 0) this.killEnemy(e)
  }

  private applySlow(e: Enemy, factor: number, time: number): void {
    if (e.slowT <= 0 || factor < e.slowFactor) e.slowFactor = factor
    e.slowT = Math.max(e.slowT, time)
  }

  /** Bosses cannot be stunned, and nothing can be stunned twice in a row. */
  private applyStun(e: Enemy, time: number): boolean {
    if (e.def.boss || e.stunGuard > 0) return false
    e.stunT = time
    e.stunGuard = time + STUN_IMMUNITY
    return true
  }

  private applyMods(e: Enemy, mods: HitMods): void {
    if (!enemyAlive(e)) return
    if (mods.slow) this.applySlow(e, mods.slow.factor, mods.slow.time)
    if (mods.poison) {
      e.poisonDps = e.poisonT > 0 ? Math.max(e.poisonDps, mods.poison.dps) : mods.poison.dps
      e.poisonT = mods.poison.time
    }
    if (mods.stun) this.applyStun(e, mods.stun)
    if (mods.shred) e.shred = Math.min(e.def.armor, e.shred + mods.shred)
  }

  private killEnemy(e: Enemy): void {
    e.hp = 0
    e.state = 'dying'
    e.anim = 'death'
    e.animT = 0
    e.blocker = null
    this.kills += 1
    if (!e.summoned && e.def.gold > 0) {
      this.gold += e.def.gold
      this.addFloat(`+${e.def.gold}`, e.x, e.y - e.def.height, 'coin')
    }
    this.addEffect('effects/soul', e.x, e.y - e.def.height * 0.5)
    this.events.push(e.def.boss ? 'boss_kill' : 'kill')
    const split = abilityOf(e.def, 'split')
    if (split) {
      const def = ENEMIES[split.type]
      for (let i = 0; i < split.count; i++) {
        const dist = Math.max(0, Math.min(e.path.length - 1, e.dist + (i - (split.count - 1) / 2) * 12))
        const child = this.spawnOn(def, e.path, dist)
        // already on the field: no fade in
        child.age = 1
      }
    }
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
      owner: null,
      throwCd: 0,
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
      if (!enemyAlive(e) || e.def.flying || abilityOf(e.def, 'ethereal')) continue
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
    if (s.owner) this.updateSoldierSkills(s, s.owner, dt)

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
          const dmg = this.roll(s.dmg)
          const cleave = s.owner ? this.skillRank(s.owner, 'cleave') : 0
          if (cleave > 0) {
            const main = s.target
            const near = this.enemies.filter(
              (o) => o !== main && enemyAlive(o) && !o.def.flying && Math.hypot(o.x - main.x, o.y - main.y) <= SKILLS.cleave.radius + o.def.radius,
            )
            for (const o of near) this.damageEnemy(o, dmg * SKILLS.cleave.part[cleave - 1], 'physical')
          }
          this.damageEnemy(s.target, dmg, 'physical')
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

  /** Skills of a specialised barracks that act through its soldiers. */
  private updateSoldierSkills(s: Soldier, owner: Tower, dt: number): void {
    const mend = this.skillRank(owner, 'mend')
    if (mend > 0 && s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + SKILLS.mend.perSec[mend - 1] * dt)
    const knives = this.skillRank(owner, 'knives')
    if (knives === 0) return
    s.throwCd -= dt
    if (s.throwCd > 0) return
    // flyers first: nothing else in the barracks can touch them
    let best: Enemy | null = null
    let bestScore = Infinity
    for (const e of this.enemies) {
      if (!enemyAlive(e) || e === s.target) continue
      const d = Math.hypot(e.x - s.x, e.y - s.y)
      if (d > SKILLS.knives.range) continue
      const score = d - (e.def.flying ? 1000 : 0)
      if (score < bestScore) {
        bestScore = score
        best = e
      }
    }
    if (!best) {
      s.throwCd = 0.3
      return
    }
    s.throwCd = SKILLS.knives.cooldown
    const sy = s.y - 14
    const ty = best.y - best.def.height * 0.5
    const d = Math.hypot(best.x - s.x, ty - sy)
    this.spawnProjectile('arrow', s.x, sy, best.x, ty, best, Math.max(0.1, d / 260), d * 0.08, SKILLS.knives.dmg[knives - 1], 'physical')
    this.events.push('arrow')
  }

  private heroSpecial(hero: Soldier): void {
    const near = this.enemies.filter(
      (e) => enemyAlive(e) && !e.def.flying && Math.hypot(e.x - hero.x, e.y - hero.y) <= HERO.specialRadius,
    )
    for (const e of near) {
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

  statsOf(t: Tower): TowerStats {
    return towerStats(t.type, t.level, t.spec)
  }

  towerRange(t: Tower): number {
    return this.statsOf(t).range
  }

  /** Blasts and shots of this tower reach flying enemies. */
  private reachesAir(t: Tower): boolean {
    return t.type !== 'artillery' || t.spec === 'rocket'
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
      spec: null,
      skills: [0, 0],
      skillCd: [0, 0],
      silenceT: 0,
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
        if (slot.soldier) this.applyBarracksStats(slot.soldier, t, true)
      }
    }
    this.events.push('upgrade')
    return true
  }

  // ------------------------------------------------------------ specialisations

  specAllowed(spec: SpecId): boolean {
    return this.level.specs?.includes(spec) ?? false
  }

  /** The tower stands at its top level and has not chosen a branch yet. */
  awaitsSpec(t: Tower): boolean {
    return t.level === MAX_LEVEL && t.spec === null && t.buildT <= 0
  }

  canSpecialize(t: Tower, spec: SpecId): boolean {
    return (
      this.result === null &&
      t.plot.tower === t &&
      this.awaitsSpec(t) &&
      SPECS[spec].base === t.type &&
      this.specAllowed(spec) &&
      this.gold >= SPECS[spec].cost
    )
  }

  specialize(t: Tower, spec: SpecId): boolean {
    if (!this.canSpecialize(t, spec)) return false
    const cost = SPECS[spec].cost
    this.gold -= cost
    t.invested += cost
    t.spec = spec
    t.cd = Math.min(t.cd, 0.3)
    this.addEffect('effects/upgrade_sparkle', t.x, t.y)
    for (const slot of t.slots) {
      if (slot.soldier) this.applyBarracksStats(slot.soldier, t, true)
    }
    this.events.push('specialize')
    return true
  }

  /** Rank of a skill on this tower; 0 when it lacks the skill or has not bought it. */
  skillRank(t: Tower, id: SkillId): number {
    if (!t.spec) return 0
    const slot = SPECS[t.spec].skills.indexOf(id)
    return slot < 0 ? 0 : t.skills[slot]
  }

  /** Price of the next rank of skill slot 0 or 1, or null when there is nothing to buy. */
  skillCost(t: Tower, slot: 0 | 1): number | null {
    if (!t.spec || t.skills[slot] >= MAX_SKILL_RANK) return null
    return SKILLS[SPECS[t.spec].skills[slot]].cost[t.skills[slot]]
  }

  buySkill(t: Tower, slot: 0 | 1): boolean {
    const cost = this.skillCost(t, slot)
    if (this.result !== null || t.plot.tower !== t || cost === null || this.gold < cost) return false
    this.gold -= cost
    t.invested += cost
    t.skills[slot] += 1
    // a freshly learned timed skill shows itself soon
    if (t.skills[slot] === 1) t.skillCd[slot] = 1.5
    this.addEffect('effects/upgrade_sparkle', t.x, t.y)
    this.events.push('skill')
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

  private applyBarracksStats(s: Soldier, t: Tower, heal: boolean): void {
    const stats = this.statsOf(t)
    s.owner = t
    s.maxHp = stats.soldierHp
    s.dmg = stats.dmg
    s.armor = stats.soldierArmor
    s.atkCd = stats.soldierAtkCd
    if (heal) s.hp = s.maxHp
    else s.hp = Math.min(s.hp, s.maxHp)
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
      this.applyBarracksStats(s, t, true)
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

  /** Living enemies inside the range of a tower, the one closest to the gate first. */
  private enemiesInRange(t: Tower, range: number, air: boolean): Enemy[] {
    const list = this.enemies.filter((e) => enemyAlive(e) && (air || !e.def.flying) && inRange(t.x, t.y, e.x, e.y, range))
    return list.sort((a, b) => a.path.length - a.dist - (b.path.length - b.dist))
  }

  private updateShooter(t: Tower, dt: number): void {
    const stats = this.statsOf(t)
    const key = towerSheet(t.type, t.level)
    const air = this.reachesAir(t)
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
    // hexed: the crew stands idle until the curse wears off
    if (t.silenceT > 0) return

    this.updateTimedSkills(t, stats.range, dt)

    const shot = t.shot
    if (shot) {
      shot.t += dt
      if (!shot.fired && shot.t >= shot.release) {
        shot.fired = true
        let target: Enemy | null = shot.target
        if (!enemyAlive(target)) target = this.findTarget(t.x, t.y, stats.range, air)
        if (target) this.fire(t, target, shot.unit)
        else t.cd = Math.min(t.cd, 0.15)
      }
      // archers take turns, so the next one may draw while this one lowers the bow
      if (shot.t >= (t.type === 'archer' ? shot.release : shot.dur)) t.shot = null
      return
    }

    if (t.cd > 0) return
    const target = this.findTarget(t.x, t.y, stats.range, air)
    if (!target) return
    t.cd = stats.cooldown
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

  /** Volley, blizzard and barrage: skills that go off by themselves every few seconds. */
  private updateTimedSkills(t: Tower, range: number, dt: number): void {
    if (!t.spec) return
    const ids = SPECS[t.spec].skills
    for (const slot of [0, 1] as const) {
      const rank = t.skills[slot]
      if (rank === 0) continue
      t.skillCd[slot] -= dt
      if (t.skillCd[slot] > 0) continue
      const id = ids[slot]
      let cooldown: number | null = null
      if (id === 'volley') {
        const targets = this.enemiesInRange(t, range, true).slice(0, SKILLS.volley.targets[rank - 1])
        targets.forEach((e, i) => this.shootArrow(t, e, i % Math.max(1, t.units.length)))
        if (targets.length > 0) {
          cooldown = SKILLS.volley.cooldown
          this.events.push('arrow')
        }
      } else if (id === 'blizzard') {
        const centre = this.findTarget(t.x, t.y, range, true)
        if (centre) {
          const freeze = SKILLS.blizzard.freeze[rank - 1]
          for (const e of this.enemies) {
            if (!enemyAlive(e) || Math.hypot(e.x - centre.x, (e.y - centre.y) / RANGE_SQUASH) > SKILLS.blizzard.radius + e.def.radius) continue
            if (!this.applyStun(e, freeze)) this.applySlow(e, FROST_SLOW.factor, freeze * 2)
            this.addEffect('effects/magic_hit', e.x, e.y - e.def.height * 0.5)
          }
          cooldown = SKILLS.blizzard.cooldown
          this.events.push('freeze')
        }
      } else if (id === 'barrage') {
        const targets = this.enemiesInRange(t, range, true)
        if (targets.length > 0) {
          const n = SKILLS.barrage.rockets[rank - 1]
          for (let i = 0; i < n; i++) {
            const p = this.shootRocket(t, targets[i % targets.length])
            p.t = -i * 0.12
          }
          cooldown = SKILLS.barrage.cooldown
          this.events.push('cannon')
        }
      } else {
        // not a timed skill: nothing to count down
        t.skillCd[slot] = Infinity
        continue
      }
      t.skillCd[slot] = cooldown ?? 0.3
    }
  }

  private shootArrow(t: Tower, target: Enemy, unit: number): void {
    const sh = sheet(towerSheet(t.type, t.level))
    const slot = sh.unitSlots[unit] ?? { x: sh.ax, y: 24 }
    const sx = t.x - sh.ax + slot.x
    const sy = t.y - sh.ay + slot.y - 7
    const hitY = target.y - target.def.height * 0.5
    const d = Math.hypot(target.x - sx, hitY - sy)
    let dmg = this.roll(this.statsOf(t).dmg)
    const mods: HitMods = {}
    let speed = 300
    if (t.spec === 'repeater') {
      const poison = this.skillRank(t, 'poison')
      if (poison > 0) mods.poison = { dps: SKILLS.poison.dps[poison - 1], time: SKILLS.poison.time }
    } else if (t.spec === 'marksman') {
      speed = 520
      mods.pierce = MARKSMAN_PIERCE
      const headshot = this.skillRank(t, 'headshot')
      if (headshot > 0 && this.rng() < SKILLS.headshot.chance[headshot - 1]) dmg = Math.round(dmg * SKILLS.headshot.mult)
      const cripple = this.skillRank(t, 'cripple')
      if (cripple > 0) mods.slow = { factor: SKILLS.cripple.factor, time: SKILLS.cripple.time[cripple - 1] }
    }
    const p = this.spawnProjectile('arrow', sx, sy, target.x, hitY, target, Math.max(0.12, d / speed), d * 0.12, dmg, 'physical')
    p.mods = mods
  }

  private shootBolt(t: Tower, target: Enemy): void {
    const sh = sheet(towerSheet(t.type, t.level))
    const slot = sh.unitSlots[0] ?? { x: sh.ax, y: 24 }
    const sx = t.x - sh.ax + slot.x
    const sy = t.y - sh.ay + slot.y - 20
    const hitY = target.y - target.def.height * 0.5
    const d = Math.hypot(target.x - sx, hitY - sy)
    const mods: HitMods = {}
    if (t.spec === 'frost') {
      mods.slow = FROST_SLOW
      const shatter = this.skillRank(t, 'shatter')
      if (shatter > 0) mods.shatter = SKILLS.shatter.part[shatter - 1]
    } else if (t.spec === 'storm') {
      const chain = this.skillRank(t, 'chain')
      if (chain > 0) mods.chain = SKILLS.chain.jumps[chain - 1]
      const sunder = this.skillRank(t, 'sunder')
      if (sunder > 0) mods.shred = SKILLS.sunder.shred[sunder - 1]
    } else if (t.level >= MAX_LEVEL) {
      mods.slow = { factor: MAGE_SLOW_FACTOR, time: MAGE_SLOW_TIME }
    }
    const speed = t.spec === 'storm' ? 420 : 230
    const p = this.spawnProjectile('bolt', sx, sy, target.x, hitY, target, Math.max(0.12, d / speed), 0, this.roll(this.statsOf(t).dmg), 'magic')
    p.mods = mods
  }

  private shootBomb(t: Tower, target: Enemy): void {
    const stats = this.statsOf(t)
    const sh = sheet(towerSheet(t.type, t.level))
    const origin = sh.projectileOrigin ?? { x: sh.ax, y: 24 }
    const sx = t.x - sh.ax + origin.x
    const sy = t.y - sh.ay + origin.y
    const flight = 0.75 + Math.hypot(target.x - sx, target.y - sy) / 500
    // lead the shot: aim where a walking target will be when the bomb lands
    let tx = target.x
    let ty = target.y
    if (target.state === 'walk' && target.stunT <= 0) {
      const ahead = samplePath(target.path, Math.min(target.path.length, target.dist + this.enemySpeed(target) * flight))
      tx = ahead.x - ahead.ty * target.lane
      ty = ahead.y + ahead.tx * target.lane
    }
    const p = this.spawnProjectile('bomb', sx, sy, tx, ty, null, flight, 46, this.roll(stats.dmg), 'physical')
    p.splash = stats.splash
    const cluster = this.skillRank(t, 'cluster')
    if (cluster > 0) p.mods.cluster = SKILLS.cluster.bomblets[cluster - 1]
    const oil = this.skillRank(t, 'oil')
    if (oil > 0) p.mods.burn = { dps: SKILLS.oil.dps[oil - 1], time: SKILLS.oil.time, radius: SKILLS.oil.radius }
    this.addEffect('effects/smoke_puff', sx, sy + 8)
  }

  /** A rocket follows its target and bursts on it, in the air or on the ground. */
  private shootRocket(t: Tower, target: Enemy): Projectile {
    const stats = this.statsOf(t)
    const sh = sheet(towerSheet(t.type, t.level))
    const origin = sh.projectileOrigin ?? { x: sh.ax, y: 24 }
    const sx = t.x - sh.ax + origin.x
    const sy = t.y - sh.ay + origin.y
    const hitY = target.y - target.def.height * 0.5
    const d = Math.hypot(target.x - sx, hitY - sy)
    const p = this.spawnProjectile('rocket', sx, sy, target.x, hitY, target, Math.max(0.25, d / 240), 22, this.roll(stats.dmg), 'physical')
    p.splash = stats.splash
    p.hitsAir = true
    const concuss = this.skillRank(t, 'concuss')
    if (concuss > 0) p.mods.stun = SKILLS.concuss.stun[concuss - 1]
    return p
  }

  private fire(t: Tower, target: Enemy, unit: number): void {
    if (t.type === 'archer') {
      this.shootArrow(t, target, unit)
      this.events.push('arrow')
    } else if (t.type === 'mage') {
      this.shootBolt(t, target)
      this.events.push('bolt')
    } else if (t.spec === 'rocket') {
      this.shootRocket(t, target)
      this.events.push('cannon')
    } else {
      this.shootBomb(t, target)
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
      kind, sx, sy, x: sx, y: sy, tx, ty, target, soldier: null, t: 0, dur, arc, dmg, dmgKind,
      splash: 0, hitsAir: false, mods: {}, angle: Math.atan2(ty - sy, tx - sx), removed: false,
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
    if (t.silenceT > 0) t.silenceT -= dt
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
    const man = p.soldier
    if (man) {
      if (soldierAlive(man)) {
        p.tx = man.x
        p.ty = man.y - 12
      } else {
        p.soldier = null
        p.ty += 12
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

  /** A single-target hit with everything the shot carries. */
  private strike(e: Enemy, p: Projectile): void {
    this.damageEnemy(e, p.dmg, p.dmgKind, p.mods.pierce ?? 0)
    this.applyMods(e, p.mods)
  }

  private impact(p: Projectile, hadTarget: Enemy | null): void {
    p.removed = true
    const target = p.target
    switch (p.kind) {
      case 'arrow':
        if (p.soldier) {
          this.damageSoldier(p.soldier, p.dmg)
          this.addEffect('effects/hit_spark', p.x, p.y)
          this.events.push('hit')
        } else if (target) {
          this.strike(target, p)
          this.addEffect('effects/hit_spark', p.x, p.y)
          this.events.push('hit')
        }
        break
      case 'bolt':
        if (target) {
          this.strike(target, p)
          if (p.mods.shatter) this.shatter(target, p, p.mods.shatter)
          if (p.mods.chain) this.chain(target, p, p.mods.chain)
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
      case 'fireball':
      case 'rocket':
        this.blast(p)
        break
    }
  }

  /** Ice splinters: part of the damage and the chill for everything next to the target. */
  private shatter(target: Enemy, p: Projectile, part: number): void {
    const near = this.enemies.filter(
      (o) => o !== target && enemyAlive(o) && Math.hypot(o.x - target.x, (o.y - target.y) / RANGE_SQUASH) <= SKILLS.shatter.radius + o.def.radius,
    )
    for (const o of near) {
      this.damageEnemy(o, p.dmg * part, p.dmgKind)
      if (p.mods.slow) this.applyMods(o, { slow: p.mods.slow })
      this.addEffect('effects/magic_hit', o.x, o.y - o.def.height * 0.5)
    }
  }

  /** Lightning arcs on to the nearest enemies around the one that was struck. */
  private chain(target: Enemy, p: Projectile, jumps: number): void {
    const near = this.enemies
      .filter((o) => o !== target && enemyAlive(o))
      .map((o) => ({ o, d: Math.hypot(o.x - target.x, (o.y - target.y) / RANGE_SQUASH) }))
      .filter((c) => c.d <= SKILLS.chain.radius)
      .sort((a, b) => a.d - b.d)
      .slice(0, jumps)
    for (const { o } of near) {
      const arc = this.spawnProjectile('bolt', p.x, p.y, o.x, o.y - o.def.height * 0.5, o, 0.12, 0, p.dmg * SKILLS.chain.part, p.dmgKind)
      if (p.mods.shred) arc.mods.shred = p.mods.shred
    }
  }

  private blast(p: Projectile): void {
    // enemy positions are ground positions, also for flyers hit in the air
    const cx = p.target ? p.target.x : p.tx
    const cy = p.target ? p.target.y : p.ty
    this.addEffect('effects/explosion', p.tx, p.ty + 4)
    this.events.push('explosion')
    const victims: { e: Enemy; k: number }[] = []
    for (const e of this.enemies) {
      if (!enemyAlive(e) || (e.def.flying && !p.hitsAir)) continue
      const d = Math.hypot(e.x - cx, (e.y - cy) / RANGE_SQUASH)
      const reach = p.splash + e.def.radius
      if (d <= reach) victims.push({ e, k: 1 - 0.5 * Math.min(1, d / reach) })
    }
    for (const { e, k } of victims) {
      this.damageEnemy(e, p.dmg * k, p.dmgKind)
      this.applyMods(e, p.mods)
    }
    const bomblets = p.mods.cluster ?? 0
    const turn = this.rand(0, Math.PI * 2)
    for (let i = 0; i < bomblets; i++) {
      const a = turn + (i / bomblets) * Math.PI * 2
      const tx = cx + Math.cos(a) * SKILLS.cluster.scatter
      const ty = cy + Math.sin(a) * SKILLS.cluster.scatter * RANGE_SQUASH
      const b = this.spawnProjectile('bomb', cx, cy - 4, tx, ty, null, 0.38, 16, p.dmg * SKILLS.cluster.part, p.dmgKind)
      b.splash = SKILLS.cluster.splash
    }
    const burn = p.mods.burn
    if (burn) this.zones.push({ x: cx, y: cy, r: burn.radius, dps: burn.dps, t: 0, life: burn.time })
  }

  private updateZone(z: Zone, dt: number): void {
    z.t += dt
    const burning = this.enemies.filter(
      (e) => enemyAlive(e) && !e.def.flying && Math.hypot(e.x - z.x, (e.y - z.y) / RANGE_SQUASH) <= z.r + e.def.radius,
    )
    for (const e of burning) this.damageEnemy(e, z.dps * dt, 'true', 0, true)
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
      p.hitsAir = true
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
    for (const z of this.zones) this.updateZone(z, dt)

    this.enemies = this.enemies.filter((e) => !e.removed)
    this.soldiers = this.soldiers.filter((s) => !s.removed)
    this.projectiles = this.projectiles.filter((p) => !p.removed)
    this.zones = this.zones.filter((z) => z.t < z.life)

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
