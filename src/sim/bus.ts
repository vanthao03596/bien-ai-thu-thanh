// What happens in a battle, told to whoever listens. The fighting code only
// says what happened and with which objects; scores, statistics and the
// notices for new players listen from outside and never reach into it.

import type { WaveGroup } from '../data/levels'
import type { Enemy, Source, Tower } from './types'

export interface GameEvents {
  /** wave is the zero-based index of the wave that just started */
  waveStarted: { wave: number; groups: readonly WaveGroup[]; tip: string | null }
  earlyWaveCalled: { wave: number; reward: number; secondsLeft: number; paths: number }
  enemyDamaged: { enemy: Enemy; amount: number; source: Source }
  enemyKilled: { enemy: Enemy; source: Source }
  enemyLeaked: { enemy: Enemy; lives: number }
  bossKilled: { enemy: Enemy }
  towerBuilt: { tower: Tower }
  towerSold: { tower: Tower; refund: number }
}

export type GameEvent = keyof GameEvents
type Handler<K extends GameEvent> = (payload: GameEvents[K]) => void

export class EventBus {
  private readonly handlers: { [K in GameEvent]: Handler<K>[] } = {
    waveStarted: [],
    earlyWaveCalled: [],
    enemyDamaged: [],
    enemyKilled: [],
    enemyLeaked: [],
    bossKilled: [],
    towerBuilt: [],
    towerSold: [],
  }

  on<K extends GameEvent>(name: K, fn: Handler<K>): void {
    this.handlers[name].push(fn)
  }

  /** Somebody listens: lets a busy caller skip building a payload nobody reads. */
  heard(name: GameEvent): boolean {
    return this.handlers[name].length > 0
  }

  emit<K extends GameEvent>(name: K, payload: GameEvents[K]): void {
    for (const fn of this.handlers[name]) fn(payload)
  }
}
