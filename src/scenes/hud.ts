import Phaser from 'phaser'
import { APP_EVENT, SCENE, fadeIn, isSwitching, retireTip, save, sfx, toggleMute } from '../app'
import { ENEMIES, type EnemyType } from '../data/enemies'
import { VIEW_H, VIEW_W } from '../data/levels'
import { HERO, SPELLS } from '../data/towers'
import { frameCamera, onPixelScale, pixelScale, touchFirst } from '../display'
import { WAVE_CALL, type Session } from '../session'
import type { SimEvent } from '../sim/types'
import type { World } from '../sim/world'
import { Tips } from '../tips'
import { BuildMenu, TowerMenu, type HudFrame } from '../ui/menus'
import { BossBar, InfoPanel, PausePanel, ResultPanel } from '../ui/panels'
import { Digits, label } from '../ui/text'
import { BUTTONS, CLICKABLE, Cursor, HUD, HitBox, RoundButton, icon, overClickable, panel, setFrame, sprite, topHit } from '../ui/widgets'
import { animKey } from '../view/battle-view'
import { Fx } from '../view/fx'
import { BATTLE_EVENT, type BattleScene } from './battle'

/** Draw order of the HUD layers, bottom to top. */
const Z = {
  world: 0,
  menus: 10,
  bar: 20,
  info: 30,
  coins: 40,
  flash: 50,
  modal: 60,
  sparks: 70,
} as const

const DRAG_START = 6
const WHEEL_GAP_MS = 180
const MAX_FLYING_COINS = 14
/** where earned coins fly to: the middle of the coin icon in the resource panel */
const PURSE = { x: 68, y: 16 } as const

interface WaveButton {
  sprite: Phaser.GameObjects.Sprite
  /** tick shown while a touch player is reading the preview */
  check: Phaser.GameObjects.Image
  timer: Digits
  hit: HitBox
}

/** A round spell button that fills up from the bottom while it recharges. */
class SpellButton {
  private readonly button: RoundButton
  private readonly fill: Phaser.GameObjects.Image
  private readonly count: Digits

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly mode: 'fire' | 'reinforce',
    iconName: string,
    private readonly cooldown: number,
    private readonly info: string[],
    private readonly session: Session,
    depth: number,
  ) {
    this.button = new RoundButton(scene, x, y, 'round_blank', () => session.toggleSpell(mode), { icon: iconName })
    this.button.root.setDepth(depth)
    this.fill = sprite(scene, BUTTONS, 'btn_round_blank_normal', 0, 0).setVisible(false)
    this.button.root.addAt(this.fill, 1)
    this.count = new Digits(scene, 16, 11, '', 'center')
    this.button.root.add(this.count.obj)
  }

  update(f: HudFrame, live: boolean): void {
    const s = this.session
    const cd = s.world.spellCd[this.mode]
    const ready = cd <= 0
    const usable = live && ready
    this.button.setState(!usable, usable && s.mode === this.mode)
    this.fill.setVisible(!ready)
    this.count.obj.setVisible(!ready)
    if (!ready) {
      const h = Math.round(32 * (1 - cd / this.cooldown))
      this.fill.setCrop(0, 32 - h, 32, h)
      this.count.set(String(Math.ceil(cd)))
    }
    if (this.button.hover && live && (!ready || s.mode === 'normal')) f.info = this.info
  }
}

/**
 * Everything drawn over the battlefield during a level, and all player input.
 * The widgets are created once; update() only moves them and swaps frames.
 */
export class HudScene extends Phaser.Scene {
  private battle!: BattleScene
  private session!: Session
  private cursor!: Cursor
  private fx!: Fx
  private clock = 0

  private worldZone!: Phaser.GameObjects.Zone
  private press: { x: number; y: number; lastX: number; lastY: number; dragging: boolean } | null = null
  private pinch: { dist: number } | null = null
  private lastWheel = 0

  private heart!: Phaser.GameObjects.Image
  private lives!: Digits
  private goldIcon!: Phaser.GameObjects.Image
  private gold!: Digits
  private waves!: Digits
  private resources!: HitBox
  private fast!: RoundButton
  private fastMark!: Digits
  private pause!: RoundButton
  private heroButton!: RoundButton
  private heroBar!: Phaser.GameObjects.Image
  private heroFill!: Phaser.GameObjects.Image
  private heroTimer!: Digits
  private spells: SpellButton[] = []
  private hint!: Phaser.GameObjects.Text
  private hintText = ''
  private tips!: Tips
  private touch = false
  private waveButtons: WaveButton[] = []
  private buildMenu!: BuildMenu
  private towerMenu!: TowerMenu
  private info!: InfoPanel
  private bossBar!: BossBar
  private pausePanel!: PausePanel
  private resultPanel!: ResultPanel
  private redFlash!: Phaser.GameObjects.Rectangle
  private flyingCoins = 0

  constructor() {
    super(SCENE.hud)
  }

  create(): void {
    const battle = this.scene.get(SCENE.battle) as BattleScene
    const session = battle.session
    if (!session) throw new Error('The HUD needs a played battle')
    this.battle = battle
    this.session = session
    this.clock = 0
    this.press = null
    this.pinch = null
    this.spells = []
    this.waveButtons = []
    this.flyingCoins = 0
    this.hintText = ''
    this.touch = touchFirst()
    this.tips = new Tips(session, save.tips, retireTip, this.touch)

    onPixelScale(this, () => frameCamera(this.cameras.main, pixelScale(this)))
    // hover state must follow widgets that appear under a resting pointer
    this.input.setPollAlways()
    // a second touch pointer, for pinch zoom
    if (this.input.manager.pointersTotal < 2) this.input.addPointer(1)

    this.cursor = new Cursor(this)
    this.fx = new Fx(this, Z.sparks)
    this.createWorldInput()
    this.createBar()
    this.createWaveButtons()
    this.buildMenu = new BuildMenu(this, session, Z.menus)
    this.towerMenu = new TowerMenu(this, session, Z.menus)
    this.info = new InfoPanel(this, Z.info)
    this.bossBar = new BossBar(this, Z.info)
    this.redFlash = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xb01828, 1).setOrigin(0, 0).setDepth(Z.flash).setAlpha(0)
    this.pausePanel = new PausePanel(this, session, Z.modal)
    this.resultPanel = new ResultPanel(this, session, this.fx, Z.modal)

    this.bindKeys()
    this.bindBattle()
    fadeIn(this)
  }

  // ------------------------------------------------------------ setup

  private createBar(): void {
    const s = this.session
    const bar = this.add.container(0, 0).setDepth(Z.bar)

    panel(this, 'panel_stone', 4, 4, 196, 24, bar)
    this.heart = icon(this, 'heart', 10, 8, bar)
    this.lives = new Digits(this, 28, 11)
    this.goldIcon = icon(this, 'coin', 60, 8, bar)
    this.gold = new Digits(this, 78, 11)
    icon(this, 'skull', 122, 8, bar)
    this.waves = new Digits(this, 140, 11)
    bar.add([this.lives.obj, this.gold.obj, this.waves.obj])
    this.resources = new HitBox(this, 4, 4, 196, 24, {}, bar, false)

    this.fast = new RoundButton(this, VIEW_W - 72, 4, 'fast', () => {
      s.toggleSpeed()
      sfx.play('click')
    }, {}, bar)
    this.fastMark = new Digits(this, VIEW_W - 56, 30, 'x2', 'center')
    bar.add(this.fastMark.obj)
    this.pause = new RoundButton(this, VIEW_W - 36, 4, 'pause', () => {
      s.paused = true
      sfx.play('click')
    }, {}, bar)

    const by = VIEW_H - 36
    this.heroButton = new RoundButton(this, 4, by, 'hero', () => s.selectHero(), {}, bar)
    this.heroBar = sprite(this, HUD, 'hp_frame', 10, by - 6, bar)
    this.heroFill = sprite(this, HUD, 'hp_fill_green', 11, by - 5, bar)
    this.heroTimer = new Digits(this, 20, by + 11, '', 'center')
    bar.add(this.heroTimer.obj)

    this.spells.push(
      new SpellButton(this, 42, by, 'fire', 'fire', SPELLS.fire.cooldown, [
        `${SPELLS.fire.name} (1)`,
        `Trút ${SPELLS.fire.count} quả cầu lửa xuống một vùng. Hồi ${SPELLS.fire.cooldown}s.`,
      ], s, Z.bar),
      new SpellButton(this, 78, by, 'reinforce', 'sword', SPELLS.reinforce.cooldown, [
        `${SPELLS.reinforce.name} (2)`,
        `Gọi ${SPELLS.reinforce.count} dân binh chặn đường trong ${SPELLS.reinforce.life}s. Hồi ${SPELLS.reinforce.cooldown}s.`,
      ], s, Z.bar),
    )

    this.hint = label(this, VIEW_W / 2, VIEW_H - 24, '', { align: 'center' }).setDepth(Z.bar).setVisible(false)
  }

  private createWaveButtons(): void {
    const s = this.session
    this.waveButtons = this.battle.view.map.spawnPoints.map(() => {
      const spr = this.add
        .sprite(0, 0, 'ui/wave_call_button')
        .play(animKey('ui/wave_call_button', 'pulse'))
        .setDepth(Z.menus)
        .setVisible(false)
      const check = icon(this, 'check', 0, 0).setDepth(Z.menus).setVisible(false)
      const timer = new Digits(this, 0, 0, '', 'center')
      timer.obj.setDepth(Z.menus).setVisible(false)
      const hit = new HitBox(this, 0, 0, 32, 32, { onClick: (pointer) => s.callWave(pointer.wasTouch) })
      hit.zone.setDepth(Z.menus)
      hit.setEnabled(false)
      return { sprite: spr, check, timer, hit }
    })
  }

  // ------------------------------------------------------------ input

  private hudPoint(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y)
  }

  /** The battlefield itself: clicks that miss every widget land here, and dragging pans a zoomed map. */
  private createWorldInput(): void {
    const zone = this.add.zone(0, 0, VIEW_W, VIEW_H).setOrigin(0, 0).setDepth(Z.world).setInteractive()
    zone.setData(CLICKABLE, false)
    this.worldZone = zone
    const E = Phaser.Input.Events

    zone.on(E.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return
      const p = this.hudPoint(pointer)
      this.press = { x: p.x, y: p.y, lastX: p.x, lastY: p.y, dragging: false }
    })
    zone.on(E.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      const press = this.press
      this.press = null
      if (!press || press.dragging || pointer.button !== 0 || this.pinch) return
      const p = this.hudPoint(pointer)
      const wp = this.battle.toWorld(p.x, p.y)
      this.session.worldClick(wp.x, wp.y)
    })
    this.input.on(E.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      const press = this.press
      if (!press || !pointer.isDown || this.pinch) return
      const p = this.hudPoint(pointer)
      if (!press.dragging && this.battle.zoomedIn && Math.hypot(p.x - press.x, p.y - press.y) > DRAG_START) {
        press.dragging = true
      }
      if (press.dragging) this.battle.panBy(p.x - press.lastX, p.y - press.lastY)
      press.lastX = p.x
      press.lastY = p.y
    })
    const release = (): void => {
      this.press = null
    }
    this.input.on(E.POINTER_UP, release)
    this.input.on(E.POINTER_UP_OUTSIDE, release)
    this.input.on(E.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      // right click backs out of whatever is armed or selected
      if (pointer.button === 2) this.session.cancel()
    })
    this.input.on(E.POINTER_WHEEL, (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      if (dy === 0 || this.time.now - this.lastWheel < WHEEL_GAP_MS || !this.canMoveCamera()) return
      this.lastWheel = this.time.now
      const p = this.hudPoint(pointer)
      this.battle.zoomBy(dy < 0 ? 1 : -1, p.x, p.y)
    })
  }

  private canMoveCamera(): boolean {
    return !this.session.paused && !isSwitching() && !(this.session.world.result !== null && this.session.resultT > 1.2)
  }

  /** Two fingers: spreading zooms in a step, pinching zooms out, moving together pans. */
  private updatePinch(): void {
    const a = this.input.pointer1
    const b = this.input.pointer2
    if (!a || !b || !a.isDown || !b.isDown || !this.canMoveCamera()) {
      this.pinch = null
      return
    }
    const pa = this.hudPoint(a)
    const pb = this.hudPoint(b)
    const dist = Math.max(1, Math.hypot(pa.x - pb.x, pa.y - pb.y))
    if (!this.pinch) {
      this.pinch = { dist }
      this.press = null
      return
    }
    const ratio = dist / this.pinch.dist
    if (ratio > 1.3 || ratio < 0.77) {
      this.battle.zoomBy(ratio > 1 ? 1 : -1, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2)
      this.pinch.dist = dist
    }
  }

  private bindKeys(): void {
    const s = this.session
    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (ev.repeat || isSwitching()) return
      const key = ev.key.toLowerCase()
      if (key === 'm') {
        toggleMute(this.game)
        return
      }
      if (s.world.result !== null) return
      switch (key) {
        case ' ':
        case 'p':
          ev.preventDefault()
          s.togglePause()
          break
        case 'escape':
          if (s.paused) s.paused = false
          else if (!s.cancel()) s.paused = true
          break
        case 'f':
          s.toggleSpeed()
          break
        case '1':
          if (!s.paused) s.toggleSpell('fire')
          break
        case '2':
          if (!s.paused) s.toggleSpell('reinforce')
          break
        case 'h':
          if (!s.paused) s.selectHero()
          break
        case '+':
        case '=':
          if (this.canMoveCamera()) this.battle.zoomBy(1)
          break
        case '-':
          if (this.canMoveCamera()) this.battle.zoomBy(-1)
          break
      }
    })
    // the window lost focus, or the rotate notice covers the game
    const onBlur = (): void => {
      if (s.world.result === null) s.paused = true
    }
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur)
    this.game.events.on(APP_EVENT.hold, onBlur)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, onBlur)
      this.game.events.off(APP_EVENT.hold, onBlur)
    })
  }

  private bindBattle(): void {
    const onSim = (ev: SimEvent): void => {
      if (ev !== 'leak') return
      this.tweens.killTweensOf(this.redFlash)
      this.redFlash.setAlpha(0.3)
      this.tweens.add({ targets: this.redFlash, alpha: 0, duration: 380, ease: 'Quad.easeOut' })
    }
    const onCoin = (x: number, y: number): void => this.flyCoin(x, y)
    const events = this.battle.events
    events.on(BATTLE_EVENT.sim, onSim)
    events.on(BATTLE_EVENT.coin, onCoin)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      events.off(BATTLE_EVENT.sim, onSim)
      events.off(BATTLE_EVENT.coin, onCoin)
    })
  }

  /** A coin leaves the spot where gold was earned and lands in the purse. */
  private flyCoin(x: number, y: number): void {
    if (this.flyingCoins >= MAX_FLYING_COINS) return
    const from = this.battle.toHud(x, y)
    if (from.x < -20 || from.x > VIEW_W + 20 || from.y < -20 || from.y > VIEW_H + 20) return
    this.flyingCoins += 1
    const coin = this.add
      .sprite(Math.round(from.x), Math.round(from.y), 'effects/coin_spin')
      .play(animKey('effects/coin_spin', 'play'))
      .setDepth(Z.coins)
    const dist = Math.hypot(from.x - PURSE.x, from.y - PURSE.y)
    this.tweens.add({
      targets: coin,
      x: { value: PURSE.x, ease: 'Sine.easeIn' },
      y: { value: PURSE.y, ease: 'Back.easeIn' },
      delay: 120,
      duration: 320 + dist * 0.9,
      onComplete: () => {
        coin.destroy()
        this.flyingCoins -= 1
        this.fx.gold(PURSE.x, PURSE.y, 3)
        this.goldIcon.y = 6
        this.tweens.add({ targets: this.goldIcon, y: 8, duration: 140, ease: 'Bounce.easeOut' })
      },
    })
  }

  // ------------------------------------------------------------ per-frame

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.1, Math.max(0, deltaMs / 1000))
    this.clock += dt
    const s = this.session
    const w = s.world
    const live = s.live
    const sel = s.selection
    const pointer = this.input.activePointer
    const mouse = !pointer.wasTouch && this.sys.game.input.isOver
    const hp = this.hudPoint(pointer)
    const wp = this.battle.toWorld(hp.x, hp.y)
    const f: HudFrame = { info: null, infoBottom: false, ranges: [] }

    this.updatePinch()

    // pointing at the field itself, not at a widget
    let hoverPlot = null
    let pickable = false
    if (live && s.mode === 'normal' && mouse && topHit(this) === this.worldZone) {
      hoverPlot = s.plotAt(wp.x, wp.y)
      pickable = s.pickable(wp.x, wp.y)
    }

    let rally: { x: number; y: number; ok: boolean } | null = null
    if (live) rally = this.updateMode(f, mouse, wp)
    this.updateWaveButtons(f, live)
    const zoom = this.battle.viewScale
    const plot = live && sel.kind === 'plot' ? sel.plot : null
    this.buildMenu.update(f, plot, plot ? this.battle.toHud(plot.x, plot.y) : null, zoom)
    const tower = live && sel.kind === 'tower' ? sel.tower : null
    this.towerMenu.update(f, tower, tower ? this.battle.toHud(tower.x, tower.y) : null, zoom)
    if (live && sel.kind === 'hero') f.info = [HERO.name, 'Bấm vào bản đồ để ra lệnh di chuyển.']
    this.updateBar(f, w, live, dt)

    this.info.show(f.info, f.infoBottom)
    this.bossBar.update(w)
    this.pausePanel.update(s.paused && w.result === null)
    this.resultPanel.update()
    this.battle.view.setOverlay({ hoverPlot, ranges: f.ranges, rally })
    this.cursor.update(overClickable(this) || pickable || (live && s.mode !== 'normal'))
  }

  /** Targeting modes: what the next click on the field will do. */
  private updateMode(f: HudFrame, mouse: boolean, wp: Phaser.Math.Vector2): { x: number; y: number; ok: boolean } | null {
    const s = this.session
    const w = s.world
    const sel = s.selection
    if (s.mode === 'rally' && sel.kind === 'tower') {
      const t = sel.tower
      f.ranges.push({ x: t.x, y: t.y + 4, r: w.towerRange(t), ok: true })
      f.info = ['Đặt điểm tập kết', this.touch ? 'Chạm vào một điểm trong vùng sáng.' : 'Bấm vào một điểm trong vùng sáng. Chuột phải để hủy.']
      return mouse ? { x: wp.x, y: wp.y, ok: w.canRally(t, wp.x, wp.y) } : null
    }
    const back = this.touch ? 'Chạm lại nút phép để hủy.' : 'Chuột phải để hủy.'
    if (s.mode === 'fire') {
      f.info = [SPELLS.fire.name, `Chọn nơi trút lửa. Gây sát thương cả quái bay. ${back}`]
      if (mouse) f.ranges.push({ x: wp.x, y: wp.y + 4, r: SPELLS.fire.radius + SPELLS.fire.scatter, ok: false })
    } else if (s.mode === 'reinforce') {
      f.info = [SPELLS.reinforce.name, `Chọn một điểm trên đường để gọi hai dân binh. ${back}`]
      if (mouse) f.ranges.push({ x: wp.x, y: wp.y + 4, r: 22, ok: true })
    }
    return null
  }

  private waveSummary(w: World): string {
    const counts = new Map<EnemyType, number>()
    for (const grp of w.nextWaveGroups()) counts.set(grp.type, (counts.get(grp.type) ?? 0) + grp.count)
    return [...counts.entries()].map(([type, n]) => `${n} ${ENEMIES[type].name}`).join(', ')
  }

  /** One line per kind of enemy in the next wave that has a trick of its own. */
  private waveTraits(w: World): string[] {
    const seen = new Set<EnemyType>()
    const lines: string[] = []
    for (const grp of w.nextWaveGroups()) {
      const def = ENEMIES[grp.type]
      if (seen.has(grp.type) || !def.trait) continue
      seen.add(grp.type)
      lines.push(`${def.name}: ${def.trait}.`)
    }
    return lines
  }

  /** Skull buttons at the road heads that will be used by the next wave. */
  private updateWaveButtons(f: HudFrame, live: boolean): void {
    const s = this.session
    const w = s.world
    const spawns = this.battle.view.map.spawnPoints
    const armed = live && s.armed === WAVE_CALL
    const used = new Set<number>()
    if (live && w.canCallWave()) {
      for (const grp of w.nextWaveGroups()) used.add(Math.min(grp.path ?? 0, spawns.length - 1))
    }
    this.waveButtons.forEach((b, idx) => {
      const on = used.has(idx)
      b.sprite.setVisible(on)
      b.hit.setEnabled(on)
      b.timer.obj.setVisible(on && w.waveTimer !== null)
      b.check.setVisible(on && armed)
      if (!on) return
      const sp = spawns[idx]
      const inside = w.level.spawns[idx] !== 'edge'
      const p = this.battle.toHud(sp.x + (inside ? 38 : 0), sp.y - (inside ? 30 : 0))
      const x = Math.round(Phaser.Math.Clamp(p.x, 22, VIEW_W - 22))
      const y = Math.round(Phaser.Math.Clamp(p.y, 60, VIEW_H - 34))
      b.hit.zone.setPosition(x - 16, y - 16)
      b.sprite.setPosition(x, y + (b.hit.down ? 1 : 0))
      b.check.setPosition(x - 8, y - 8)
      if (w.waveTimer !== null) b.timer.set(String(Math.ceil(w.waveTimer))).moveTo(x, y - 28)
      if (b.hit.hover || armed) {
        const bonus = w.earlyBonus()
        const how = armed ? 'Chạm lần nữa để gọi quái ra trận.' : 'Bấm để gọi quái ra trận.'
        f.info = [
          `Đợt ${w.waveIndex + 2}/${w.waveCount}: ${this.waveSummary(w)}`,
          bonus > 0 ? `Gọi sớm được thưởng ${bonus} vàng.${armed ? ` ${how}` : ''}` : how,
          ...this.waveTraits(w),
        ]
      }
    })
  }

  /** Resources, speed and pause, the hero and the spells. */
  private updateBar(f: HudFrame, w: World, live: boolean, dt: number): void {
    const s = this.session
    const hurt = w.time - w.leakT < 0.6 && Math.floor(this.clock * 12) % 2 === 0
    this.heart.setY(8 + (hurt ? 1 : 0)).setAlpha(hurt ? 0.5 : 1)
    this.lives.set(String(w.lives))
    this.gold.set(String(w.gold))
    this.waves.set(`${Math.max(0, w.waveIndex + 1)}/${w.waveCount}`)
    if (this.resources.hover && live) {
      f.info = ['Mạng  -  Vàng  -  Đợt quái', 'Để lọt quái sẽ mất mạng. Hết mạng là thất thủ.']
    }

    this.fast.setInert(!live).setState(!live, live && s.speed === 2)
    this.fastMark.obj.setVisible(live && s.speed === 2)
    this.pause.setInert(!live).setState(!live)
    if (live && this.fast.hover) f.info = ['Tua nhanh (F)', s.speed === 2 ? 'Đang chạy tốc độ x2.' : 'Chạy trận đấu ở tốc độ x2.']
    if (live && this.pause.hover) f.info = ['Tạm dừng (Space)', 'Mở bảng tạm dừng.']

    const hero = w.hero
    const heroDown = hero.state === 'dead' || hero.state === 'dying'
    this.heroButton.setInert(!live).setState(!live || heroDown, live && s.selection.kind === 'hero')
    if (live && this.heroButton.hover) {
      f.info = [`${HERO.name} (H)`, heroDown ? 'Đang hồi sinh...' : 'Chọn tướng rồi bấm vào bản đồ để di chuyển.']
    }
    this.heroBar.setVisible(!heroDown)
    this.heroFill.setVisible(!heroDown)
    this.heroTimer.obj.setVisible(hero.state === 'dead')
    if (hero.state === 'dead') this.heroTimer.set(String(Math.ceil(hero.respawnT)))
    if (!heroDown) {
      const ratio = hero.hp / hero.maxHp
      setFrame(this.heroFill, ratio > 0.5 ? 'hp_fill_green' : ratio > 0.25 ? 'hp_fill_yellow' : 'hp_fill_red')
      this.heroFill.setCrop(0, 0, Math.max(1, Math.round(18 * ratio)), 3)
    }

    for (const spell of this.spells) spell.update(f, live)

    // one line of advice for new players, unless something else needs the bottom of the screen
    const tip = this.tips.update(dt)
    const showHint = tip !== null && s.mode === 'normal' && !this.bossBar.visible && !(f.info && f.infoBottom)
    this.hint.setVisible(showHint)
    if (showHint && tip !== null) {
      if (tip !== this.hintText) {
        this.hintText = tip
        this.hint.setText(tip)
      }
      this.hint.setAlpha(0.75 + 0.25 * Math.sin(this.clock * 4))
    }
  }
}
