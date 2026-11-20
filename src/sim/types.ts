import type { Point } from '../assets'
import type { EnemyDef } from '../data/enemies'
import type { TowerType } from '../data/towers'
import type { PathData } from './path'

export type DamageKind = 'physical' | 'magic' | 'true'
export type Dir = 'side' | 'down' | 'up'

export type EnemyState = 'walk' | 'blocked' | 'attack' | 'cast' | 'dying'

export interface Enemy {
  id: number
  def: EnemyDef
  path: PathData
  /** distance travelled along the path */
  dist: number
  /** sideways offset from the path centre line */
  lane: number
  x: number
  y: number
  hp: number
  state: EnemyState
  anim: string
  animT: number
  dir: Dir
  flip: boolean
  /** the soldier holding this enemy in place */
  blocker: Soldier | null
  cd: number
  hitDone: boolean
  slowT: number
  healCd: number
  age: number
  removed: boolean
}

export type SoldierKind = 'soldier' | 'hero' | 'reinforcement'
export type SoldierState = 'idle' | 'move' | 'fight' | 'attack' | 'special' | 'dying' | 'dead'

export interface Soldier {
  id: number
  kind: SoldierKind
  sheet: string
  x: number
  y: number
  /** the spot the unit guards and returns to */
  home: Point
  hp: number
  maxHp: number
  dmg: readonly [number, number]
  armor: number
  atkCd: number
  speed: number
  state: SoldierState
  anim: string
  animT: number
  flip: boolean
  target: Enemy | null
  /** which side of the target the unit fights from: -1 left, 1 right */
  side: number
  slotDy: number
  cd: number
  hitDone: boolean
  idleT: number
  /** remaining lifetime in seconds (Infinity for permanent units) */
  life: number
  respawnT: number
  specialCd: number
  /** hero only: walking to a commanded spot, ignoring enemies on the way */
  forced: boolean
  removed: boolean
}

export interface Plot {
  id: number
  x: number
  y: number
  tower: Tower | null
}

export interface TowerUnit {
  /** seconds into the shoot animation, or -1 while idle */
  shootT: number
  dir: Dir
  flip: boolean
}

export interface TowerShot {
  target: Enemy
  t: number
  release: number
  dur: number
  fired: boolean
  unit: number
}

export interface BarracksSlot {
  soldier: Soldier | null
  respawnT: number
}

export interface Tower {
  id: number
  plot: Plot
  type: TowerType
  level: number
  x: number
  y: number
  invested: number
  /** seconds of construction left */
  buildT: number
  cd: number
  animT: number
  /** seconds into the attack animation of the tower body, or -1 */
  attackT: number
  shot: TowerShot | null
  units: TowerUnit[]
  nextUnit: number
  // barracks
  slots: BarracksSlot[]
  rally: Point
  doorT: number
  doorSlot: number
  doorSpawned: boolean
}

export type ProjectileKind = 'arrow' | 'bolt' | 'bomb' | 'fireball' | 'heal'

export interface Projectile {
  kind: ProjectileKind
  sx: number
  sy: number
  x: number
  y: number
  tx: number
  ty: number
  target: Enemy | null
  /** negative while the projectile is still waiting to launch */
  t: number
  dur: number
  arc: number
  dmg: number
  dmgKind: DamageKind
  splash: number
  slow: boolean
  angle: number
  removed: boolean
}

export type EffectLayer = 'ground' | 'top'

export interface Effect {
  sheet: string
  x: number
  y: number
  t: number
  layer: EffectLayer
}

export type FloatIcon = 'coin' | 'heart' | 'none'

export interface FloatText {
  text: string
  x: number
  y: number
  t: number
  icon: FloatIcon
}

export interface RallyFlag {
  x: number
  y: number
  t: number
}

export interface Spawn {
  at: number
  def: EnemyDef
  path: number
}

export type SimEvent =
  | 'arrow'
  | 'bolt'
  | 'cannon'
  | 'explosion'
  | 'hit'
  | 'magic_hit'
  | 'melee'
  | 'kill'
  | 'boss_kill'
  | 'leak'
  | 'build'
  | 'upgrade'
  | 'sell'
  | 'wave'
  | 'coin'
  | 'heal'
  | 'spell_fire'
  | 'spell_reinforce'
  | 'hero_down'
  | 'hero_up'
  | 'hero_special'
  | 'soldier_down'
  | 'win'
  | 'lose'

export type GameResult = 'win' | 'lose' | null
