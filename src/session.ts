import type { Sfx } from './audio'
import { LEVELS } from './data/levels'
import type { Plot, SimEvent, Tower } from './sim/types'
import { World } from './sim/world'

const STEP = 1 / 60

export type Mode = 'normal' | 'rally' | 'fire' | 'reinforce'
export type Selection =
  | { kind: 'none' }
  | { kind: 'plot'; plot: Plot }
  | { kind: 'tower'; tower: Tower }
  | { kind: 'hero' }

const NONE: Selection = { kind: 'none' }

/** id of the armed option while a touch player is looking at the next wave before calling it */
export const WAVE_CALL = 'wave-call'

/**
 * One played level: the simulation plus everything the player has selected or
 * armed. It knows nothing about rendering, so scenes only read it and call it.
 */
export class Session {
  readonly world: World
  paused = false
  speed = 1
  selection: Selection = NONE
  mode: Mode = 'normal'
  /** option waiting for a second tap on touch screens */
  armed: string | null = null
  /** seconds since the battle was decided */
  resultT = 0
  /** how often the player has sent the hero somewhere */
  heroOrders = 0
  /** how often the player has moved a rally point */
  rallyOrders = 0
  private acc = 0

  constructor(
    readonly levelIndex: number,
    private readonly sfx: Sfx,
    private readonly onWin: (levelId: string, stars: number) => void,
  ) {
    this.world = new World(LEVELS[levelIndex])
  }

  /** The battle is running and accepts orders. */
  get live(): boolean {
    return !this.paused && this.world.result === null
  }

  /** Advances the simulation in fixed steps and returns what happened, in order. */
  advance(dt: number): SimEvent[] {
    const w = this.world
    if (this.paused) return []
    this.acc += dt * (w.result === null ? this.speed : 1)
    while (this.acc >= STEP) {
      w.update(STEP)
      this.acc -= STEP
    }
    const events = w.events.slice()
    w.events.length = 0
    for (const ev of events) {
      this.sfx.play(ev)
      // the preview the player was reading belongs to a wave that is now on the field
      if (ev === 'wave' && this.armed === WAVE_CALL) this.armed = null
    }
    if (w.result !== null) {
      if (this.resultT === 0) this.onResult()
      this.resultT += dt
    }
    const sel = this.selection
    if (sel.kind === 'tower' && sel.tower.plot.tower !== sel.tower) this.selection = NONE
    if (sel.kind === 'plot' && sel.plot.tower) this.selection = NONE
    return events
  }

  private onResult(): void {
    const w = this.world
    this.selection = NONE
    this.mode = 'normal'
    this.armed = null
    if (w.result === 'win') this.onWin(w.level.id, w.stars)
  }

  // ------------------------------------------------------------ commands

  /** Backs out of the current targeting mode or selection. Returns false when there was nothing to cancel. */
  cancel(): boolean {
    this.armed = null
    if (this.mode !== 'normal') {
      this.mode = 'normal'
      return true
    }
    if (this.selection.kind !== 'none') {
      this.selection = NONE
      return true
    }
    return false
  }

  clearSelection(): void {
    this.selection = NONE
  }

  togglePause(): void {
    if (this.world.result === null) this.paused = !this.paused
  }

  toggleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : 1
  }

  toggleSpell(mode: 'fire' | 'reinforce'): void {
    if (this.mode === mode) {
      this.mode = 'normal'
      return
    }
    if (this.world.spellCd[mode] > 0) {
      this.sfx.play('deny')
      return
    }
    this.mode = mode
    this.selection = NONE
    this.armed = null
    this.sfx.play('select')
  }

  startRally(): void {
    this.mode = 'rally'
    this.armed = null
    this.sfx.play('select')
  }

  selectHero(): void {
    this.mode = 'normal'
    this.armed = null
    this.selection = this.selection.kind === 'hero' ? NONE : { kind: 'hero' }
    this.sfx.play('select')
  }

  /** Runs an action, asking for a confirming second tap on touch screens. */
  confirm(id: string, touch: boolean, action: () => void): void {
    if (touch && this.armed !== id) {
      this.armed = id
      this.sfx.play('select')
      return
    }
    this.armed = null
    action()
  }

  /** Calls the next wave; on touch screens the first tap only shows what is coming. */
  callWave(touch: boolean): void {
    if (!this.live || !this.world.canCallWave()) return
    this.confirm(WAVE_CALL, touch, () => {
      if (this.world.callWave()) this.sfx.play('click')
    })
  }

  // ------------------------------------------------------------ picking

  plotAt(x: number, y: number): Plot | null {
    for (const p of this.world.plots) {
      if (!p.tower && Math.abs(x - p.x) <= 22 && Math.abs(y - (p.y - 4)) <= 14) return p
    }
    return null
  }

  towerAt(x: number, y: number): Tower | null {
    let best: Tower | null = null
    for (const t of this.world.towers) {
      if (Math.abs(x - t.x) <= 20 && y >= t.y - 48 && y <= t.y + 8 && (!best || t.y > best.y)) best = t
    }
    return best
  }

  heroAt(x: number, y: number): boolean {
    const h = this.world.hero
    if (h.state === 'dead' || h.state === 'dying') return false
    return Math.abs(x - h.x) <= 11 && y >= h.y - 28 && y <= h.y + 5
  }

  /** Something under this point reacts to a click in normal mode. */
  pickable(x: number, y: number): boolean {
    return this.plotAt(x, y) !== null || this.towerAt(x, y) !== null || this.heroAt(x, y)
  }

  /** A click on the battlefield, in world coordinates. */
  worldClick(x: number, y: number): void {
    const w = this.world
    if (!this.live) return
    const sel = this.selection
    if (this.mode === 'rally') {
      if (sel.kind === 'tower' && w.setRally(sel.tower, x, y)) {
        this.mode = 'normal'
        this.rallyOrders += 1
        this.sfx.play('select')
      } else {
        this.sfx.play('deny')
      }
      return
    }
    if (this.mode === 'fire') {
      if (w.castFireRain(x, y)) this.mode = 'normal'
      return
    }
    if (this.mode === 'reinforce') {
      if (w.castReinforcements(x, y)) this.mode = 'normal'
      return
    }
    this.armed = null
    if (sel.kind === 'hero' && !this.heroAt(x, y)) {
      w.moveHero(x, y)
      w.flags.push({ x, y, t: 1.4 })
      this.heroOrders += 1
      this.selection = NONE
      this.sfx.play('select')
      return
    }
    if (this.heroAt(x, y)) {
      this.selectHero()
      return
    }
    const tower = this.towerAt(x, y)
    if (tower) {
      this.selection = sel.kind === 'tower' && sel.tower === tower ? NONE : { kind: 'tower', tower }
      this.sfx.play('select')
      return
    }
    const plot = this.plotAt(x, y)
    if (plot) {
      this.selection = sel.kind === 'plot' && sel.plot === plot ? NONE : { kind: 'plot', plot }
      this.sfx.play('select')
      return
    }
    this.selection = NONE
  }
}
