import { ENDLESS, type EndlessGroup, type EndlessWave } from '../data/endless'
import type { WaveDef, WaveGroup } from '../data/levels'
import type { EventBus } from './bus'

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

/** The tier the waves of a cycle are drawn from. */
export function tierOf(wave: number): number {
  return Math.min(ENDLESS.tiers.length - 1, Math.floor(wave / ENDLESS.cycle))
}

/**
 * Puts the waves of an endless battle together from the stock in data/endless.
 * It draws with its own random numbers, so the same map always gets the same
 * run of waves whatever happens on the field.
 */
export class EndlessDirector {
  private readonly rng: () => number
  /** stock waves already played; a stock is only reused once it is used up */
  private readonly used = new Set<EndlessWave>()
  /** waves borrowed from the next tier in the running cycle */
  private peeks = 0
  private expect = 0

  constructor(seed: number, private readonly pathCount: number) {
    this.rng = mulberry32(seed * 6151 + 101)
  }

  /** Composes wave `index` (zero based). The waves have to be asked for in order. */
  next(index: number): WaveDef {
    if (index !== this.expect) throw new Error(`Endless wave ${index} asked for out of order`)
    this.expect += 1
    const pos = index % ENDLESS.cycle
    if (pos === 0) this.peeks = 0
    const tier = tierOf(index)
    const def = ENDLESS.tiers[tier]
    let stock: readonly EndlessWave[] = def.waves
    if (pos === ENDLESS.cycle - 1) {
      stock = def.bossWaves
    } else {
      const half = Math.floor(ENDLESS.cycle / 2)
      const chance = pos >= half ? (ENDLESS.peekChance[pos - half] ?? 0) * Math.pow(0.5, this.peeks) : 0
      if (tier + 1 < ENDLESS.tiers.length && this.rng() < chance) {
        stock = ENDLESS.tiers[tier + 1].waves
        this.peeks += 1
      }
    }
    const wave = this.pick(stock)
    // the very first wave always comes down a single road
    const split = index > 0 && this.pathCount > 1 && this.rng() < def.splitChance[0] + def.splitChance[1] * pos
    const main = Math.floor(this.rng() * this.pathCount)
    const other = (main + 1 + Math.floor(this.rng() * Math.max(1, this.pathCount - 1))) % this.pathCount
    return { groups: wave.groups.map((g) => this.place(g, pos, split && g.alt === true ? other : main)) }
  }

  private pick(stock: readonly EndlessWave[]): EndlessWave {
    let fresh = stock.filter((w) => !this.used.has(w))
    if (fresh.length === 0) {
      for (const w of stock) this.used.delete(w)
      fresh = [...stock]
    }
    const wave = fresh[Math.floor(this.rng() * fresh.length)]
    this.used.add(wave)
    return wave
  }

  private place(g: EndlessGroup, pos: number, path: number): WaveGroup {
    const extra = (g.grow ?? 0) * Math.floor(pos / (g.every ?? 1))
    return { type: g.type, count: g.count + extra, gap: g.gap, at: g.at, path }
  }
}

/**
 * Keeps the score of an endless battle. It only listens: a new wave, a kill
 * and an early call are worth points, and unlike gold a kill pays for armor
 * and speed too, because the score rewards what was hard to bring down.
 */
export class EndlessScore {
  points = 0

  constructor(bus: EventBus) {
    const s = ENDLESS.score
    bus.on('waveStarted', ({ wave }) => {
      this.points += s.perWave * wave
    })
    bus.on('enemyKilled', ({ enemy }) => {
      const def = enemy.def
      this.points += Math.round((1 + Math.max(def.armor, def.magicRes)) * def.hp * s.perHp * (def.speed / s.speedRef))
    })
    bus.on('earlyWaveCalled', ({ secondsLeft, paths }) => {
      this.points += Math.round(secondsLeft * s.perSecondEarly * paths)
    })
  }
}
