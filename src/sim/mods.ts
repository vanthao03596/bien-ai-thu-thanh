// Timed effects on an enemy (slow, poison, stun, haste...) and the one rule
// that decides how they stack. Every effect is data: a new one needs an entry
// here and nothing in the fighting code.

import type { Source } from './types'

export type ModId = 'slow' | 'poison' | 'stun' | 'stun_guard' | 'haste'

export interface ModDef {
  id: ModId
  /** strength: a higher level replaces a lower one of the same id */
  level: number
  /** seconds the effect lasts */
  duration: number
  /** several layers of the same level may run side by side */
  stacks?: boolean
  /** a higher level takes the place of a lower one (default true) */
  replacesLower?: boolean
  /** the same level only renews the time of the one already there (default true) */
  refreshSame?: boolean
  /** effects that cannot be put on while this one runs */
  bans?: readonly ModId[]
  /** putting this one on also lifts the banned effects already there */
  removeBanned?: boolean
  /** multiplier on the walking speed */
  speed?: number
  /** damage per second, ignoring armor */
  dps?: number
  /** frozen in place */
  frozen?: boolean
}

export interface ActiveMod {
  def: ModDef
  /** seconds left */
  left: number
  /** who put it on, for the kill it may cause */
  source: Source | null
}

function removeWhere(mods: ActiveMod[], pred: (m: ActiveMod) => boolean): void {
  for (let i = mods.length - 1; i >= 0; i--) if (pred(mods[i])) mods.splice(i, 1)
}

/**
 * Puts an effect on, unless something already there forbids it. Effects with
 * different ids never get in each other's way; for the same id the stronger
 * one wins and an equal one renews the time. Returns true when the effect
 * went on as a new entry.
 */
export function addMod(mods: ActiveMod[], def: ModDef, source: Source | null = null): boolean {
  if (mods.some((m) => m.def.bans?.includes(def.id) ?? false)) return false
  if (def.removeBanned) removeWhere(mods, (m) => def.bans?.includes(m.def.id) ?? false)
  for (const m of [...mods]) {
    if (m.def.id !== def.id) continue
    if (m.def.level === def.level && def.stacks) break
    if (m.def.level < def.level && (def.replacesLower ?? true)) {
      removeWhere(mods, (x) => x === m)
      continue
    }
    // a renewal never cuts short what is already running
    if (m.def.level === def.level && (def.refreshSame ?? true)) m.left = Math.max(m.left, def.duration)
    return false
  }
  mods.push({ def, left: def.duration, source })
  return true
}

/** Counts every effect down and drops the ones that ran out. */
export function tickMods(mods: ActiveMod[], dt: number): void {
  for (const m of mods) m.left -= dt
  removeWhere(mods, (m) => m.left <= 0)
}

export function modOf(mods: readonly ActiveMod[], id: ModId): ActiveMod | undefined {
  return mods.find((m) => m.def.id === id)
}

export function hasMod(mods: readonly ActiveMod[], id: ModId): boolean {
  return mods.some((m) => m.def.id === id)
}

/** Product of every speed multiplier in the list. */
export function speedOf(mods: readonly ActiveMod[]): number {
  let k = 1
  for (const m of mods) if (m.def.speed !== undefined) k *= m.def.speed
  return k
}

export function isFrozen(mods: readonly ActiveMod[]): boolean {
  return mods.some((m) => m.def.frozen === true)
}

// ---------------------------------------------------------------- the effects of the game

/** A slow is as strong as the share of speed it takes away. */
export function slowMod(factor: number, time: number): ModDef {
  return { id: 'slow', level: Math.round((1 - factor) * 100), duration: time, speed: factor }
}

export function poisonMod(dps: number, time: number): ModDef {
  return { id: 'poison', level: dps, duration: time, dps }
}

export function stunMod(time: number): ModDef {
  return { id: 'stun', level: 1, duration: time, frozen: true }
}

/** Runs past the stun it came with: nothing can be stunned twice in a row. */
export function stunGuardMod(time: number): ModDef {
  return { id: 'stun_guard', level: 1, duration: time, bans: ['stun'] }
}

/** A marching aura; it has to be renewed all the time to last. */
export function hasteMod(speed: number, time: number): ModDef {
  return { id: 'haste', level: Math.round(speed * 100), duration: time, speed }
}
