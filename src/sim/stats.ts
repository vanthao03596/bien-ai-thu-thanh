import { HERO, TOWERS, TOWER_TYPES, type TowerType } from '../data/towers'
import type { EventBus } from './bus'
import type { Source } from './types'

/** Who a kill or a point of damage is credited to: a kind of tower, the hero, or the spells. */
export type Credit = TowerType | 'hero' | 'spell'

export const CREDITS: readonly Credit[] = [...TOWER_TYPES, 'hero', 'spell']

export function creditName(c: Credit): string {
  return c === 'hero' ? HERO.name : c === 'spell' ? 'Phép' : TOWERS[c].name
}

function creditOf(source: Source): Credit {
  // a soldier fights for the barracks that trained it; reinforcements come from a spell
  if (source.tower) return source.tower.type
  return source.soldier?.kind === 'hero' ? 'hero' : 'spell'
}

function tally(): Record<Credit, number> {
  return { archer: 0, barracks: 0, mage: 0, artillery: 0, hero: 0, spell: 0 }
}

/**
 * What each part of the defence achieved in one battle, for the summary at the
 * end. It only listens to the bus: the fighting code knows nothing about it.
 */
export class BattleStats {
  readonly kills = tally()
  readonly damage = tally()
  /** lives lost at the gate */
  leaked = 0

  constructor(bus: EventBus) {
    bus.on('enemyKilled', ({ source }) => {
      this.kills[creditOf(source)] += 1
    })
    bus.on('enemyDamaged', ({ amount, source }) => {
      this.damage[creditOf(source)] += amount
    })
    bus.on('enemyLeaked', ({ lives }) => {
      this.leaked += lives
    })
  }

  /** The one with the highest count in a tally, or null when nothing was counted. */
  static top(table: Record<Credit, number>): Credit | null {
    let best: Credit | null = null
    for (const c of CREDITS) {
      if (table[c] > 0 && (best === null || table[c] > table[best])) best = c
    }
    return best
  }
}
