import Phaser from 'phaser'
import { SCENE, fadeIn, isSwitching, nextDemo, recordWin, save, sfx, type BattleInit } from '../app'
import { DEFAULT_DIFFICULTY } from '../data/difficulty'
import { LEVELS, VIEW_H, VIEW_W } from '../data/levels'
import { frameCamera, onPixelScale, pixelScale } from '../display'
import { Session } from '../session'
import { Bot } from '../sim/bot'
import type { SimEvent } from '../sim/types'
import { World } from '../sim/world'
import { BattleView, type Focus } from '../view/battle-view'

const STEP = 1 / 60
const NO_FOCUS: Focus = { plot: null, tower: null, hero: false }
/** how far the player can zoom in, relative to the whole map fitting the screen */
const ZOOM_FACTORS = [1, 1.5, 2] as const

export const BATTLE_EVENT = {
  /** (event: SimEvent) something happened in the played battle */
  sim: 'sim',
  /** (x, y) gold was earned at a world position */
  coin: 'coin',
} as const

/**
 * The battlefield: runs the simulation, owns the world camera and hosts the
 * view. In demo mode a bot plays and nothing reacts to input; otherwise the
 * HUD scene drives it through the session.
 */
export class BattleScene extends Phaser.Scene {
  session: Session | null = null
  world!: World
  view!: BattleView

  private demo = true
  private levelIndex = 0
  private bot: Bot | null = null
  private acc = 0
  private demoEndT = 0

  // camera: the visible part of the map in world pixels, and the device pixels per world pixel
  private zoomIndex = 0
  private zoom = 1
  private viewX = 0
  private viewY = 0
  private zoomTween: Phaser.Tweens.Tween | null = null
  private blur: Phaser.Filters.Blur | null = null

  constructor() {
    super(SCENE.battle)
  }

  init(data: Partial<BattleInit>): void {
    this.demo = data.demo ?? true
    this.levelIndex = Phaser.Math.Clamp(data.levelIndex ?? 0, 0, LEVELS.length - 1)
  }

  create(): void {
    this.acc = 0
    this.demoEndT = 0
    this.zoomIndex = 0
    this.viewX = 0
    this.viewY = 0
    this.zoomTween = null
    this.blur = null

    if (this.demo) {
      this.session = null
      this.world = new World(LEVELS[this.levelIndex], DEFAULT_DIFFICULTY)
      this.bot = new Bot(this.world)
    } else {
      this.session = new Session(this.levelIndex, sfx, recordWin, save.difficulty)
      this.world = this.session.world
      this.bot = null
    }
    this.view = new BattleView(this, this.world, {
      onCoin: (x, y) => this.events.emit(BATTLE_EVENT.coin, x, y),
    })

    onPixelScale(this, () => {
      this.zoomTween?.stop()
      this.zoomTween = null
      this.zoom = this.zoomLevels()[this.zoomIndex]
      this.applyCamera()
    })
    fadeIn(this)
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.1, Math.max(0, deltaMs / 1000))
    const session = this.session
    if (session) {
      for (const ev of session.advance(dt)) this.onSimEvent(ev)
      const sel = session.selection
      this.view.update(
        dt,
        {
          plot: sel.kind === 'plot' ? sel.plot : null,
          tower: sel.kind === 'tower' ? sel.tower : null,
          hero: sel.kind === 'hero',
        },
        session.paused ? 0 : this.world.result === null ? session.speed : 1,
      )
      this.setBlurred(session.paused)
      return
    }
    this.stepDemo(dt)
    this.view.update(dt, NO_FOCUS, 1)
  }

  private stepDemo(dt: number): void {
    const w = this.world
    this.acc += dt
    while (this.acc >= STEP) {
      this.bot?.update(STEP)
      w.update(STEP)
      this.acc -= STEP
    }
    w.events.length = 0
    if (w.result === null || isSwitching()) return
    this.demoEndT += dt
    if (this.demoEndT > 3 && this.demoEndT < 100) {
      this.demoEndT = 100
      nextDemo(this, (this.levelIndex + 1) % LEVELS.length)
    }
  }

  private onSimEvent(ev: SimEvent): void {
    const cam = this.cameras.main
    switch (ev) {
      case 'explosion':
        cam.shake(160, 0.004)
        break
      case 'leak':
        cam.shake(220, 0.005, true)
        break
      case 'boss_kill':
        cam.shake(700, 0.01, true)
        break
      case 'hero_special':
        cam.shake(120, 0.0025)
        break
      case 'quake':
        cam.shake(260, 0.006)
        break
      case 'lose':
        this.fadeToGrey()
        break
    }
    this.events.emit(BATTLE_EVENT.sim, ev)
  }

  // ------------------------------------------------------------ screen filters

  /** Drains the colour from the field when the gate has fallen. */
  private fadeToGrey(): void {
    const grade = this.cameras.main.filters.external.addColorMatrix()
    const state = { amount: 0 }
    this.tweens.add({
      targets: state,
      amount: 0.85,
      duration: 1400,
      ease: 'Sine.easeInOut',
      onUpdate: () => grade.colorMatrix.grayscale(state.amount),
    })
  }

  /** Softens the field behind the pause panel. */
  private setBlurred(on: boolean): void {
    if (!on && !this.blur) return
    if (!this.blur) this.blur = this.cameras.main.filters.external.addBlur(0, 1, 1, 1)
    if (this.blur.active !== on) this.blur.setActive(on)
  }

  // ------------------------------------------------------------ camera

  /** Whole-number zoom steps, so one world pixel always covers a whole number of device pixels. */
  private zoomLevels(): number[] {
    const s = pixelScale(this)
    const levels: number[] = []
    for (const f of ZOOM_FACTORS) {
      const z = Math.round(s * f)
      if (!levels.includes(z)) levels.push(z)
    }
    while (this.zoomIndex >= levels.length) this.zoomIndex -= 1
    return levels
  }

  /** World pixels visible across the screen at the current zoom. */
  private get viewW(): number {
    return (VIEW_W * pixelScale(this)) / this.zoom
  }

  private get viewH(): number {
    return (VIEW_H * pixelScale(this)) / this.zoom
  }

  private applyCamera(): void {
    const z = this.zoom
    this.viewX = Phaser.Math.Clamp(this.viewX, 0, Math.max(0, VIEW_W - this.viewW))
    this.viewY = Phaser.Math.Clamp(this.viewY, 0, Math.max(0, VIEW_H - this.viewH))
    // snap to device pixels so the art does not shimmer while panning
    frameCamera(this.cameras.main, z, Math.round(this.viewX * z) / z, Math.round(this.viewY * z) / z)
  }

  /** Can the map be dragged right now? Only when zoomed in. */
  get zoomedIn(): boolean {
    return this.zoomIndex > 0
  }

  /** Screen size of one world pixel in HUD units. */
  get viewScale(): number {
    return this.zoom / pixelScale(this)
  }

  /** HUD position of a world point. */
  toHud(x: number, y: number): Phaser.Math.Vector2 {
    const k = this.viewScale
    return new Phaser.Math.Vector2((x - this.viewX) * k, (y - this.viewY) * k)
  }

  /** World position of a HUD point. */
  toWorld(x: number, y: number): Phaser.Math.Vector2 {
    const k = this.viewScale
    return new Phaser.Math.Vector2(this.viewX + x / k, this.viewY + y / k)
  }

  /** Steps the zoom in (+1) or out (-1), keeping the world point under the given HUD position in place. */
  zoomBy(step: number, hudX = VIEW_W / 2, hudY = VIEW_H / 2): void {
    const levels = this.zoomLevels()
    const next = Phaser.Math.Clamp(this.zoomIndex + step, 0, levels.length - 1)
    if (next === this.zoomIndex) return
    this.zoomIndex = next
    const anchor = this.toWorld(hudX, hudY)
    const s = pixelScale(this)
    this.zoomTween?.stop()
    this.zoomTween = this.tweens.add({
      targets: this,
      zoom: levels[next],
      duration: 160,
      ease: 'Sine.easeOut',
      onUpdate: () => {
        const k = this.zoom / s
        this.viewX = anchor.x - hudX / k
        this.viewY = anchor.y - hudY / k
        this.applyCamera()
      },
      onComplete: () => {
        this.zoomTween = null
      },
    })
  }

  /** Drags the map by a distance given in HUD units. */
  panBy(dx: number, dy: number): void {
    if (this.zoomTween) return
    const k = this.viewScale
    this.viewX -= dx / k
    this.viewY -= dy / k
    this.applyCamera()
  }
}
