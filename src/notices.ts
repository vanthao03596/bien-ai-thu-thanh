import type { EnemyType } from './data/enemies'
import type { World } from './sim/world'

/** A card for the player: an enemy type met for the first time, or advice the level attached to a wave. */
export type Notice = { kind: 'enemy'; type: EnemyType } | { kind: 'tip'; text: string }

/** seconds a card stays up when the player does not dismiss it */
export const NOTICE_LIFE = 10

export interface NoticeBook {
  /** enemy types the player has already been introduced to */
  seen: readonly string[]
  /** ids of the wave tips already shown (they live among the retired beginner tips) */
  retired: readonly string[]
  onSeen: (type: EnemyType) => void
  onTip: (id: string) => void
}

/**
 * Queues the cards of one battle. It listens for waves starting: every enemy
 * type the save has not met yet gets a card once, for the whole game, and a
 * wave that carries advice shows it right when it applies. The advice of the
 * first wave is up from the start, before anything is built.
 */
export class Notices {
  private readonly queue: Notice[] = []
  private readonly seen: Set<string>
  private readonly retired: Set<string>
  private age = 0

  constructor(
    private readonly world: World,
    private readonly book: NoticeBook,
  ) {
    this.seen = new Set(book.seen)
    this.retired = new Set(book.retired)
    this.addTip(0, world.nextWaveTip())
    world.bus.on('waveStarted', ({ wave, groups, tip }) => {
      for (const grp of groups) {
        if (this.seen.has(grp.type)) continue
        this.seen.add(grp.type)
        this.queue.push({ kind: 'enemy', type: grp.type })
        book.onSeen(grp.type)
      }
      if (wave > 0) this.addTip(wave, tip)
    })
  }

  private addTip(wave: number, text: string | null): void {
    if (text === null) return
    const id = `wave:${this.world.level.id}:${this.world.mode}:${wave}`
    if (this.retired.has(id)) return
    this.retired.add(id)
    this.queue.push({ kind: 'tip', text })
    this.book.onTip(id)
  }

  /** The card on screen, or null. */
  get current(): Notice | null {
    return this.queue[0] ?? null
  }

  /** Seconds the current card has been up. */
  get shownFor(): number {
    return this.age
  }

  /** Advances by dt seconds of play; a card leaves by itself after NOTICE_LIFE. */
  update(dt: number): void {
    if (this.queue.length === 0) return
    this.age += dt
    if (this.age >= NOTICE_LIFE) this.dismiss()
  }

  /** Takes the current card down; the next one in the queue follows. */
  dismiss(): void {
    if (this.queue.shift()) this.age = 0
  }
}
