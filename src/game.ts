import { atlasFrame } from './assets'
import { Sfx } from './audio'
import { ENEMIES, type EnemyType } from './data/enemies'
import { LEVELS, VIEW_H, VIEW_W } from './data/levels'
import { HERO, MAX_LEVEL, SPELLS, TOWERS, TOWER_TYPES } from './data/towers'
import { Gfx } from './gfx'
import { MapView } from './render/map'
import { drawScene, type RangeMarker } from './render/scene'
import { loadSave, storeSave, type SaveData } from './save'
import { Bot } from './sim/bot'
import type { Plot, Tower } from './sim/types'
import { World } from './sim/world'

const STEP = 1 / 60
const PARCHMENT_INK = '#3b2414'
const GOLD = '#ffe27a'
const CREAM = '#f6efd8'

type Screen = 'title' | 'levels' | 'play'
type Mode = 'normal' | 'rally' | 'fire' | 'reinforce'
type Selection =
  | { kind: 'none' }
  | { kind: 'plot'; plot: Plot }
  | { kind: 'tower'; tower: Tower }
  | { kind: 'hero' }

interface Region {
  id: string
  x: number
  y: number
  w: number
  h: number
  onClick: () => void
}

interface Pointer {
  x: number
  y: number
  inside: boolean
  down: boolean
  touch: boolean
}

const RING_OFFSETS: readonly (readonly [number, number])[] = [
  [-30, -30],
  [30, -30],
  [-30, 28],
  [30, 28],
]

export class Game {
  private readonly g: Gfx
  private readonly sfx = new Sfx()
  private readonly save: SaveData

  private screen: Screen = 'title'
  private time = 0
  private lastNow = 0
  private acc = 0

  // battle
  private world: World | null = null
  private map: MapView | null = null
  private levelIndex = 0
  private paused = false
  private speed = 1
  private selection: Selection = { kind: 'none' }
  private mode: Mode = 'normal'
  private resultT = 0
  /** option waiting for a second tap on touch screens */
  private armed: string | null = null

  // background battle shown behind the menus
  private demoWorld: World
  private demoMap: MapView
  private demoBot: Bot
  private demoEndT = 0

  // immediate-mode UI state
  private regions: Region[] = []
  private prevRegions: Region[] = []
  private pressId: string | null = null
  private readonly pointer: Pointer = { x: -100, y: -100, inside: false, down: false, touch: false }
  private info: string[] | null = null
  /** show the info panel at the bottom when a menu occupies the top of the screen */
  private infoBottom = false
  private ranges: RangeMarker[] = []
  private nextRanges: RangeMarker[] = []
  private clickable = false

  constructor(canvas: HTMLCanvasElement) {
    this.g = new Gfx(canvas)
    this.save = loadSave()
    this.sfx.muted = this.save.muted
    this.demoWorld = new World(LEVELS[0])
    this.demoMap = new MapView(LEVELS[0])
    this.demoBot = new Bot(this.demoWorld)
    this.bindEvents(canvas)
  }

  start(): void {
    this.lastNow = performance.now()
    requestAnimationFrame(this.frame)
  }

  // ------------------------------------------------------------ input

  private bindEvents(canvas: HTMLCanvasElement): void {
    window.addEventListener('resize', () => this.g.resize())
    const move = (ev: PointerEvent): void => {
      const p = this.g.toLogical(ev.clientX, ev.clientY)
      this.pointer.x = p.x
      this.pointer.y = p.y
      this.pointer.inside = p.x >= 0 && p.x < VIEW_W && p.y >= 0 && p.y < VIEW_H
      this.pointer.touch = ev.pointerType === 'touch'
    }
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return
      move(ev)
      this.sfx.unlock()
      this.pointer.down = true
      const r = this.regionAt(this.pointer.x, this.pointer.y)
      this.pressId = r ? r.id : '#world'
      try {
        canvas.setPointerCapture(ev.pointerId)
      } catch {
        // synthetic pointers cannot be captured; the click still works
      }
    })
    canvas.addEventListener('pointerup', (ev) => {
      if (ev.button !== 0) return
      move(ev)
      const press = this.pressId
      this.pressId = null
      this.pointer.down = false
      const r = this.regionAt(this.pointer.x, this.pointer.y)
      if (r) {
        if (r.id === press) r.onClick()
      } else if (press === '#world' && this.pointer.inside) {
        this.worldClick(this.pointer.x, this.pointer.y)
      }
      if (this.pointer.touch) this.pointer.inside = false
    })
    canvas.addEventListener('pointercancel', () => {
      this.pressId = null
      this.pointer.down = false
    })
    canvas.addEventListener('pointerleave', () => {
      this.pointer.inside = false
    })
    canvas.addEventListener('contextmenu', (ev) => {
      ev.preventDefault()
      this.cancel()
    })
    window.addEventListener('keydown', (ev) => this.onKey(ev))
    window.addEventListener('blur', () => {
      if (this.screen === 'play' && this.world && this.world.result === null) this.paused = true
    })
  }

  private onKey(ev: KeyboardEvent): void {
    if (ev.repeat) return
    const key = ev.key.toLowerCase()
    if (key === 'm') {
      this.toggleMute()
      return
    }
    if (this.screen !== 'play' || !this.world) {
      if (key === 'enter' || key === ' ') {
        ev.preventDefault()
        this.sfx.unlock()
        if (this.screen === 'title') this.screen = 'levels'
      } else if (key === 'escape' && this.screen === 'levels') {
        this.screen = 'title'
      }
      return
    }
    if (this.world.result !== null) return
    switch (key) {
      case ' ':
      case 'p':
        ev.preventDefault()
        this.paused = !this.paused
        break
      case 'escape':
        if (this.paused) this.paused = false
        else if (!this.cancel()) this.paused = true
        break
      case 'f':
        this.speed = this.speed === 1 ? 2 : 1
        break
      case '1':
        if (!this.paused) this.toggleMode('fire')
        break
      case '2':
        if (!this.paused) this.toggleMode('reinforce')
        break
      case 'h':
        if (!this.paused) this.selectHero()
        break
    }
  }

  /** Backs out of the current targeting mode or selection. Returns false when there was nothing to cancel. */
  private cancel(): boolean {
    this.armed = null
    if (this.mode !== 'normal') {
      this.mode = 'normal'
      return true
    }
    if (this.selection.kind !== 'none') {
      this.selection = { kind: 'none' }
      return true
    }
    return false
  }

  private toggleMute(): void {
    this.sfx.muted = !this.sfx.muted
    this.save.muted = this.sfx.muted
    storeSave(this.save)
  }

  private toggleMode(mode: Mode): void {
    const w = this.world
    if (!w) return
    if (this.mode === mode) {
      this.mode = 'normal'
      return
    }
    const cd = mode === 'fire' ? w.spellCd.fire : mode === 'reinforce' ? w.spellCd.reinforce : 0
    if (cd > 0) {
      this.sfx.play('deny')
      return
    }
    this.mode = mode
    this.selection = { kind: 'none' }
    this.armed = null
    this.sfx.play('select')
  }

  private selectHero(): void {
    const w = this.world
    if (!w) return
    this.mode = 'normal'
    this.armed = null
    this.selection = this.selection.kind === 'hero' ? { kind: 'none' } : { kind: 'hero' }
    this.sfx.play('select')
  }

  private regionAt(x: number, y: number): Region | null {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i]
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r
    }
    return null
  }

  private plotAt(x: number, y: number): Plot | null {
    const w = this.world
    if (!w) return null
    for (const p of w.plots) {
      if (!p.tower && Math.abs(x - p.x) <= 22 && Math.abs(y - (p.y - 4)) <= 14) return p
    }
    return null
  }

  private towerAt(x: number, y: number): Tower | null {
    const w = this.world
    if (!w) return null
    let best: Tower | null = null
    for (const t of w.towers) {
      if (Math.abs(x - t.x) <= 20 && y >= t.y - 48 && y <= t.y + 8 && (!best || t.y > best.y)) best = t
    }
    return best
  }

  private heroAt(x: number, y: number): boolean {
    const h = this.world?.hero
    if (!h || h.state === 'dead' || h.state === 'dying') return false
    return Math.abs(x - h.x) <= 11 && y >= h.y - 28 && y <= h.y + 5
  }

  private worldClick(x: number, y: number): void {
    const w = this.world
    if (this.screen !== 'play' || !w || this.paused || w.result !== null) return
    const sel = this.selection
    if (this.mode === 'rally') {
      if (sel.kind === 'tower' && w.setRally(sel.tower, x, y)) {
        this.mode = 'normal'
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
      this.selection = { kind: 'none' }
      this.sfx.play('select')
      return
    }
    if (this.heroAt(x, y)) {
      this.selectHero()
      return
    }
    const tower = this.towerAt(x, y)
    if (tower) {
      this.selection = sel.kind === 'tower' && sel.tower === tower ? { kind: 'none' } : { kind: 'tower', tower }
      this.sfx.play('select')
      return
    }
    const plot = this.plotAt(x, y)
    if (plot) {
      this.selection = sel.kind === 'plot' && sel.plot === plot ? { kind: 'none' } : { kind: 'plot', plot }
      this.sfx.play('select')
      return
    }
    this.selection = { kind: 'none' }
  }

  // ------------------------------------------------------------ flow

  private startLevel(index: number): void {
    this.levelIndex = index
    this.world = new World(LEVELS[index])
    this.map = new MapView(LEVELS[index])
    this.screen = 'play'
    this.paused = false
    this.speed = 1
    this.selection = { kind: 'none' }
    this.mode = 'normal'
    this.armed = null
    this.resultT = 0
    this.acc = 0
    this.nextRanges = []
  }

  private toMenu(): void {
    this.world = null
    this.map = null
    this.screen = 'levels'
    this.paused = false
  }

  private unlocked(index: number): boolean {
    return index === 0 || (this.save.stars[LEVELS[index - 1].id] ?? 0) >= 1
  }

  private restartDemo(): void {
    const next = (LEVELS.indexOf(this.demoWorld.level) + 1) % LEVELS.length
    this.demoWorld = new World(LEVELS[next])
    this.demoMap = new MapView(LEVELS[next])
    this.demoBot = new Bot(this.demoWorld)
    this.demoEndT = 0
  }

  // ------------------------------------------------------------ update

  private readonly frame = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - this.lastNow) / 1000))
    this.lastNow = now
    this.update(dt)
    this.render()
    requestAnimationFrame(this.frame)
  }

  private update(dt: number): void {
    this.time += dt
    const w = this.world
    if (this.screen === 'play' && w) {
      if (this.paused) return
      this.acc += dt * (w.result === null ? this.speed : 1)
      while (this.acc >= STEP) {
        w.update(STEP)
        this.acc -= STEP
      }
      for (const ev of w.events) this.sfx.play(ev)
      w.events.length = 0
      if (w.result !== null) {
        if (this.resultT === 0) this.onResult(w)
        this.resultT += dt
      }
      const sel = this.selection
      if (sel.kind === 'tower' && sel.tower.plot.tower !== sel.tower) this.selection = { kind: 'none' }
      if (sel.kind === 'plot' && sel.plot.tower) this.selection = { kind: 'none' }
      return
    }
    // menus: a bot plays in the background
    const d = this.demoWorld
    this.acc += dt
    while (this.acc >= STEP) {
      this.demoBot.update(STEP)
      d.update(STEP)
      this.acc -= STEP
    }
    d.events.length = 0
    if (d.result !== null) {
      this.demoEndT += dt
      if (this.demoEndT > 3) this.restartDemo()
    }
  }

  private onResult(w: World): void {
    this.selection = { kind: 'none' }
    this.mode = 'normal'
    this.armed = null
    if (w.result === 'win') {
      const id = w.level.id
      this.save.stars[id] = Math.max(this.save.stars[id] ?? 0, w.stars)
      storeSave(this.save)
    }
  }

  // ------------------------------------------------------------ widgets

  private hit(x: number, y: number, w: number, h: number): boolean {
    const p = this.pointer
    return p.inside && p.x >= x && p.x < x + w && p.y >= y && p.y < y + h
  }

  /** Registers a clickable area and reports whether the pointer is over it. */
  private region(id: string, x: number, y: number, w: number, h: number, onClick: () => void): boolean {
    this.regions.push({ id, x, y, w, h, onClick })
    const hot = this.hit(x, y, w, h)
    if (hot) this.clickable = true
    return hot
  }

  /** Runs an action, asking for a confirming second tap on touch screens. */
  private confirm(id: string, action: () => void): void {
    if (this.pointer.touch && this.armed !== id) {
      this.armed = id
      this.sfx.play('select')
      return
    }
    this.armed = null
    action()
  }

  private roundButton(
    id: string,
    name: string,
    x: number,
    y: number,
    onClick: () => void,
    opts: { disabled?: boolean; active?: boolean; icon?: string } = {},
  ): boolean {
    const hot = this.region(id, x, y, 32, 32, () => {
      if (opts.disabled) this.sfx.play('deny')
      else onClick()
    })
    const pressed = !opts.disabled && (opts.active === true || (hot && this.pointer.down && this.pressId === id))
    const state = opts.disabled ? 'disabled' : pressed ? 'pressed' : 'normal'
    this.g.frame('ui/buttons', `btn_${name}_${state}`, x, y)
    if (opts.icon) this.g.icon(opts.icon, x + 8, y + 8 + (pressed ? 1 : 0), opts.disabled ? 0.45 : 1)
    return hot
  }

  private rectButton(id: string, label: string, x: number, y: number, w: number, color: 'green' | 'red', onClick: () => void): void {
    const hot = this.region(id, x, y, w, 20, () => {
      this.sfx.play('click')
      onClick()
    })
    const pressed = hot && this.pointer.down && this.pressId === id
    this.g.three('ui/buttons', `btn_rect_${color}_${pressed ? 'pressed' : 'normal'}`, x, y, w)
    this.g.text(label, x + w / 2, y + 2 + (pressed ? 1 : 0), { align: 'center', color: hot ? '#ffffff' : CREAM })
  }

  private veil(alpha: number): void {
    this.g.rect(0, 0, VIEW_W, VIEW_H, '#1d1322', alpha)
  }

  // ------------------------------------------------------------ render

  private render(): void {
    const g = this.g
    g.begin()
    this.prevRegions = this.regions
    this.regions = []
    this.info = null
    this.infoBottom = false
    this.clickable = false
    this.ranges = this.nextRanges
    this.nextRanges = []

    if (this.screen === 'play' && this.world && this.map) {
      this.renderPlay(this.world, this.map)
    } else {
      drawScene(g, this.demoWorld, this.demoMap, {
        time: this.time, hoverPlot: null, selectedPlot: null, selectedTower: null, heroSelected: false, ranges: [],
      })
      if (this.screen === 'title') this.renderTitle()
      else this.renderLevels()
    }
    this.drawCursor()
  }

  private drawCursor(): void {
    const p = this.pointer
    if (p.touch || !p.inside) return
    const gold = this.clickable || this.mode !== 'normal'
    this.g.frame('ui/hud', gold ? 'cursor_gold' : 'cursor_point', p.x - 1, p.y - 1)
  }

  private renderTitle(): void {
    const g = this.g
    this.veil(0.45)
    const bob = Math.round(Math.sin(this.time * 2) * 2)
    g.text('BIÊN ẢI', VIEW_W / 2, 92 + bob, { size: 96, align: 'center', color: GOLD })
    g.text('Thủ Thành Pixel', VIEW_W / 2, 186, { size: 32, align: 'center' })
    this.rectButton('title-play', 'Bắt đầu', VIEW_W / 2 - 60, 250, 120, 'green', () => {
      this.screen = 'levels'
    })
    this.rectButton('title-sound', `Âm thanh: ${this.sfx.muted ? 'Tắt' : 'Bật'}`, VIEW_W / 2 - 60, 278, 120, 'green', () => this.toggleMute())
    g.text('Chuột trái: chọn và xây   Chuột phải: hủy   Space: tạm dừng', VIEW_W / 2, 372, { align: 'center', alpha: 0.9 })
    g.text('F: tua nhanh   1, 2: phép   H: chọn tướng   M: tắt tiếng', VIEW_W / 2, 390, { align: 'center', alpha: 0.9 })
  }

  private renderLevels(): void {
    const g = this.g
    this.veil(0.55)
    g.text('Chọn màn chơi', VIEW_W / 2, 30, { size: 48, align: 'center', color: GOLD })
    const cardW = 216
    const cardH = 214
    const gap = 24
    const left = (VIEW_W - (cardW * LEVELS.length + gap * (LEVELS.length - 1))) / 2
    LEVELS.forEach((level, i) => {
      const x = left + i * (cardW + gap)
      const y = 104
      const open = this.unlocked(i)
      const hot =
        this.region(`level-${i}`, x, y, cardW, cardH, () => {
          if (open) {
            this.sfx.play('click')
            this.startLevel(i)
          } else {
            this.sfx.play('deny')
          }
        }) && open
      g.nine('ui/hud', 'panel_parchment', x, y - (hot ? 2 : 0), cardW, cardH)
      const top = y - (hot ? 2 : 0)
      g.text(`Màn ${i + 1}`, x + cardW / 2, top + 12, { align: 'center', color: '#8a5a2c', outline: null })
      g.text(level.name, x + cardW / 2, top + 28, { size: 32, align: 'center', color: PARCHMENT_INK, outline: null })
      const lines = g.wrap(level.blurb, cardW - 28)
      lines.forEach((line, k) => g.text(line, x + cardW / 2, top + 68 + k * 15, { align: 'center', color: PARCHMENT_INK, outline: null }))
      g.text(`${level.waves.length} đợt quái`, x + cardW / 2, top + 134, { align: 'center', color: '#8a5a2c', outline: null })
      if (open) {
        const stars = this.save.stars[level.id] ?? 0
        for (let s = 0; s < 3; s++) {
          g.frameScaled('ui/icons_16', s < stars ? 'star' : 'star_empty', x + cardW / 2 - 54 + s * 36, top + 158, 2)
        }
      } else {
        g.frameScaled('ui/icons_16', 'lock', x + cardW / 2 - 16, top + 156, 2)
        g.rect(x + 2, top + 2, cardW - 4, cardH - 4, '#1d1322', 0.35)
      }
    })
    this.rectButton('levels-back', 'Quay lại', VIEW_W / 2 - 50, 350, 100, 'red', () => {
      this.screen = 'title'
    })
  }

  // ------------------------------------------------------------ battle screen

  private renderPlay(w: World, map: MapView): void {
    const g = this.g
    const p = this.pointer
    const live = !this.paused && w.result === null
    const sel = this.selection

    const overUi = this.prevRegions.some((r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h)
    let hoverPlot: Plot | null = null
    if (live && this.mode === 'normal' && p.inside && !p.touch && !overUi) {
      hoverPlot = this.plotAt(p.x, p.y)
      if (hoverPlot || this.towerAt(p.x, p.y) || this.heroAt(p.x, p.y)) this.clickable = true
    }

    drawScene(g, w, map, {
      time: this.time,
      hoverPlot,
      selectedPlot: sel.kind === 'plot' ? sel.plot : null,
      selectedTower: sel.kind === 'tower' ? sel.tower : null,
      heroSelected: sel.kind === 'hero',
      ranges: this.ranges,
    })

    if (live) {
      this.drawModeOverlay(w)
      this.drawWaveButtons(w, map)
      if (sel.kind === 'plot') this.drawBuildMenu(w, sel.plot)
      else if (sel.kind === 'tower') this.drawTowerMenu(w, sel.tower)
      else if (sel.kind === 'hero') this.info = [`${HERO.name}`, 'Bấm vào bản đồ để ra lệnh di chuyển.']
    }
    this.drawHud(w, live)
    this.drawInfo()
    if (w.result !== null) {
      if (this.resultT > 1.2) this.drawResult(w)
    } else if (this.paused) {
      this.drawPause()
    }
  }

  private drawModeOverlay(w: World): void {
    const g = this.g
    const p = this.pointer
    const sel = this.selection
    if (this.mode === 'rally' && sel.kind === 'tower') {
      const t = sel.tower
      this.nextRanges.push({ x: t.x, y: t.y + 4, r: w.towerRange(t), ok: true })
      this.info = ['Đặt điểm tập kết', 'Bấm vào một điểm trong vùng sáng. Chuột phải để hủy.']
      if (p.inside && !p.touch) {
        const ok = w.canRally(t, p.x, p.y)
        g.spriteAt('ui/rally_flag', 'wave', this.time, p.x, p.y, false, ok ? 0.9 : 0.35)
      }
    } else if (this.mode === 'fire') {
      this.info = [SPELLS.fire.name, 'Chọn nơi trút lửa. Gây sát thương cả quái bay. Chuột phải để hủy.']
      if (p.inside && !p.touch) this.nextRanges.push({ x: p.x, y: p.y + 4, r: SPELLS.fire.radius + SPELLS.fire.scatter, ok: false })
    } else if (this.mode === 'reinforce') {
      this.info = [SPELLS.reinforce.name, 'Chọn một điểm trên đường để gọi hai dân binh. Chuột phải để hủy.']
      if (p.inside && !p.touch) this.nextRanges.push({ x: p.x, y: p.y + 4, r: 22, ok: true })
    }
  }

  private waveSummary(w: World): string {
    const counts = new Map<EnemyType, number>()
    for (const grp of w.nextWaveGroups()) counts.set(grp.type, (counts.get(grp.type) ?? 0) + grp.count)
    return [...counts.entries()].map(([type, n]) => `${n} ${ENEMIES[type].name}`).join(', ')
  }

  private drawWaveButtons(w: World, map: MapView): void {
    if (!w.canCallWave()) return
    const g = this.g
    const used = new Set<number>()
    for (const grp of w.nextWaveGroups()) used.add(Math.min(grp.path ?? 0, map.spawnPoints.length - 1))
    for (const idx of used) {
      const sp = map.spawnPoints[idx]
      const inside = w.level.spawns[idx] !== 'edge'
      const x = Math.max(22, Math.min(VIEW_W - 22, sp.x + (inside ? 38 : 0)))
      const y = Math.max(60, Math.min(VIEW_H - 34, sp.y - (inside ? 30 : 0)))
      const hot = this.region(`wave-${idx}`, x - 16, y - 16, 32, 32, () => {
        if (w.callWave()) this.sfx.play('click')
      })
      g.spriteAt('ui/wave_call_button', 'pulse', this.time, x, y + (hot && this.pointer.down ? 1 : 0))
      if (w.waveTimer !== null) g.digits(String(Math.ceil(w.waveTimer)), x, y - 28, 'center')
      if (hot) {
        const bonus = w.earlyBonus()
        this.info = [
          `Đợt ${w.waveIndex + 2}/${w.waveCount}: ${this.waveSummary(w)}`,
          bonus > 0 ? `Gọi sớm được thưởng ${bonus} vàng.` : 'Bấm để gọi quái ra trận.',
        ]
      }
    }
  }

  private drawBuildMenu(w: World, plot: Plot): void {
    const g = this.g
    this.infoBottom = plot.y < 190
    const cx = Math.max(52, Math.min(VIEW_W - 52, plot.x))
    const cy = Math.max(58, Math.min(VIEW_H - 56, plot.y - 12))
    TOWER_TYPES.forEach((type, i) => {
      const def = TOWERS[type]
      const off = RING_OFFSETS[i]
      const x = cx + off[0] - 18
      const y = cy + off[1] - 22
      const id = `build-${type}`
      const allowed = w.level.towers.includes(type)
      const cost = def.cost[0]
      const affordable = w.gold >= cost
      const hot =
        this.region(id, x, y, 36, 44, () => {
          if (!allowed || !affordable) {
            this.sfx.play('deny')
            return
          }
          this.confirm(id, () => {
            if (w.build(plot.id, type)) this.selection = { kind: 'none' }
          })
        }) || this.armed === id
      const lift = hot && allowed ? -1 : 0
      g.frame('ui/hud', allowed ? `build_${type}` : `build_${type}_locked`, x, y + lift, allowed && !affordable ? 0.6 : 1)
      if (allowed) {
        const label = String(cost)
        g.digits(label, x + 23, y + 32 + lift, 'center', affordable ? 1 : 0.55)
        if (this.armed === id) g.icon('check', x + 10, y + 10 + lift)
      }
      if (hot && allowed) {
        this.info = [`${def.name}  -  ${cost} vàng`, def.blurb]
        this.nextRanges.push({ x: plot.x, y: plot.y + 4, r: def.range[0], ok: affordable })
      }
    })
  }

  private towerInfo(t: Tower, level: number): string {
    const def = TOWERS[t.type]
    if (t.type === 'barracks') {
      return `Lính: ${def.soldierHp[level]} máu, sát thương ${def.dmg[level][0]}-${def.dmg[level][1]}, giáp ${Math.round(def.soldierArmor[level] * 100)}%`
    }
    const extra = t.type === 'artillery' ? `, nổ lan ${def.splash[level]}` : t.type === 'mage' && level >= MAX_LEVEL ? ', làm chậm' : ''
    return `Sát thương ${def.dmg[level][0]}-${def.dmg[level][1]}, nhịp ${def.cooldown[level]}s, tầm ${def.range[level]}${extra}`
  }

  private drawTowerMenu(w: World, t: Tower): void {
    const g = this.g
    const def = TOWERS[t.type]
    this.info = [`${def.name} cấp ${t.level + 1}`, t.buildT > 0 ? 'Đang xây...' : this.towerInfo(t, t.level)]
    this.infoBottom = t.y < 200
    if (this.mode !== 'normal') return
    this.nextRanges.push({ x: t.x, y: t.y + 4, r: w.towerRange(t), ok: true })
    if (t.buildT > 0) return

    const cx = Math.max(60, Math.min(VIEW_W - 60, t.x))
    const cy = Math.max(84, Math.min(VIEW_H - 76, t.y - 26))
    const cost = w.upgradeCost(t)
    if (cost !== null) {
      const id = 'tower-upgrade'
      const affordable = w.gold >= cost
      const x = cx - 16
      const y = cy - 58
      const hot =
        this.roundButton(id, 'upgrade', x, y, () => this.confirm(id, () => void w.upgrade(t)), { disabled: !affordable }) ||
        this.armed === id
      g.digits(String(cost), cx, y + 26, 'center', affordable ? 1 : 0.6)
      if (this.armed === id) g.icon('check', x + 8, y + 8)
      if (hot) {
        this.info = [`Nâng lên cấp ${t.level + 2}  -  ${cost} vàng`, this.towerInfo(t, t.level + 1)]
        this.nextRanges.push({ x: t.x, y: t.y + 4, r: def.range[t.level + 1], ok: affordable })
      }
    }
    {
      const id = 'tower-sell'
      const x = cx - 16
      const y = cy + 30
      const value = w.sellValue(t)
      const hot =
        this.roundButton(id, 'sell', x, y, () =>
          this.confirm(id, () => {
            if (w.sell(t)) this.selection = { kind: 'none' }
          }),
        ) || this.armed === id
      g.digits(`+${value}`, cx, y + 26, 'center')
      if (this.armed === id) g.icon('check', x + 8, y + 8)
      if (hot) this.info = ['Bán tháp', `Hoàn lại ${value} vàng.`]
    }
    if (t.type === 'barracks') {
      const hot = this.roundButton('tower-rally', 'rally', cx + 28, cy - 14, () => {
        this.mode = 'rally'
        this.armed = null
        this.sfx.play('select')
      })
      if (hot) this.info = ['Điểm tập kết', 'Chọn nơi lính đứng chặn quái.']
    }
  }

  private drawHud(w: World, live: boolean): void {
    const g = this.g
    // resources
    g.nine('ui/hud', 'panel_stone', 4, 4, 196, 24)
    const hurt = w.time - w.leakT < 0.6 && Math.floor(this.time * 12) % 2 === 0
    g.icon('heart', 10, 8 + (hurt ? 1 : 0), hurt ? 0.5 : 1)
    g.digits(String(w.lives), 28, 11)
    g.icon('coin', 60, 8)
    g.digits(String(w.gold), 78, 11)
    g.icon('skull', 122, 8)
    g.digits(`${Math.max(0, w.waveIndex + 1)}/${w.waveCount}`, 140, 11)
    if (this.hit(4, 4, 196, 24) && live) {
      this.info = ['Mạng  -  Vàng  -  Đợt quái', 'Để lọt quái sẽ mất mạng. Hết mạng là thất thủ.']
    }

    if (!live) {
      g.frame('ui/buttons', 'btn_fast_disabled', VIEW_W - 72, 4)
      g.frame('ui/buttons', 'btn_pause_disabled', VIEW_W - 36, 4)
    } else {
      const fastHot = this.roundButton('hud-fast', 'fast', VIEW_W - 72, 4, () => {
        this.speed = this.speed === 1 ? 2 : 1
        this.sfx.play('click')
      }, { active: this.speed === 2 })
      if (this.speed === 2) g.digits('x2', VIEW_W - 56, 30, 'center')
      if (fastHot) this.info = ['Tua nhanh (F)', this.speed === 2 ? 'Đang chạy tốc độ x2.' : 'Chạy trận đấu ở tốc độ x2.']
      const pauseHot = this.roundButton('hud-pause', 'pause', VIEW_W - 36, 4, () => {
        this.paused = true
        this.sfx.play('click')
      })
      if (pauseHot) this.info = ['Tạm dừng (Space)', 'Mở bảng tạm dừng.']
    }

    // hero and spells
    const by = VIEW_H - 36
    const hero = w.hero
    const heroDown = hero.state === 'dead' || hero.state === 'dying'
    if (!live) {
      g.frame('ui/buttons', 'btn_hero_disabled', 4, by)
    } else {
      const hot = this.roundButton('hud-hero', 'hero', 4, by, () => this.selectHero(), {
        disabled: heroDown,
        active: this.selection.kind === 'hero',
      })
      if (hot) {
        this.info = [`${HERO.name} (H)`, heroDown ? 'Đang hồi sinh...' : 'Chọn tướng rồi bấm vào bản đồ để di chuyển.']
      }
    }
    if (heroDown) {
      if (hero.state === 'dead') g.digits(String(Math.ceil(hero.respawnT)), 20, by + 11, 'center')
    } else {
      const ratio = hero.hp / hero.maxHp
      g.frame('ui/hud', 'hp_frame', 10, by - 6)
      const fill = ratio > 0.5 ? 'hp_fill_green' : ratio > 0.25 ? 'hp_fill_yellow' : 'hp_fill_red'
      g.framePart('ui/hud', fill, 11, by - 5, Math.max(1, Math.round(18 * ratio)), 3)
    }
    this.spellButton(live, 'fire', 42, by, 'fire', w.spellCd.fire, SPELLS.fire.cooldown, [
      `${SPELLS.fire.name} (1)`,
      `Trút ${SPELLS.fire.count} quả cầu lửa xuống một vùng. Hồi ${SPELLS.fire.cooldown}s.`,
    ])
    this.spellButton(live, 'reinforce', 78, by, 'sword', w.spellCd.reinforce, SPELLS.reinforce.cooldown, [
      `${SPELLS.reinforce.name} (2)`,
      `Gọi ${SPELLS.reinforce.count} dân binh chặn đường trong ${SPELLS.reinforce.life}s. Hồi ${SPELLS.reinforce.cooldown}s.`,
    ])

    if (live && w.waveIndex === -1 && !(this.info && this.infoBottom)) {
      const pulse = 0.75 + 0.25 * Math.sin(this.time * 4)
      g.text('Xây tháp trên các ô đất, rồi bấm nút đầu lâu để gọi đợt quái đầu tiên', VIEW_W / 2, VIEW_H - 24, {
        align: 'center', alpha: pulse,
      })
    }
  }

  private spellButton(
    live: boolean,
    mode: 'fire' | 'reinforce',
    x: number,
    y: number,
    icon: string,
    cd: number,
    max: number,
    info: string[],
  ): void {
    const g = this.g
    const ready = cd <= 0
    if (!live || !ready) {
      const hot = this.region(`hud-${mode}`, x, y, 32, 32, () => this.sfx.play('deny'))
      g.frame('ui/buttons', 'btn_round_blank_disabled', x, y)
      if (!ready) {
        const h = Math.round(32 * (1 - cd / max))
        g.framePart('ui/buttons', 'btn_round_blank_normal', x, y, 32, h, 0, 32 - h)
        g.icon(icon, x + 8, y + 8, 0.45)
        g.digits(String(Math.ceil(cd)), x + 16, y + 11, 'center')
      } else {
        g.icon(icon, x + 8, y + 8, 0.45)
      }
      if (hot && live) this.info = info
      return
    }
    const hot = this.roundButton(`hud-${mode}`, 'round_blank', x, y, () => this.toggleMode(mode), {
      active: this.mode === mode,
      icon,
    })
    if (hot && this.mode === 'normal') this.info = info
  }

  private drawInfo(): void {
    const lines = this.info
    if (!lines) return
    const g = this.g
    const w = 352
    const wrapped: string[] = []
    lines.forEach((line, i) => {
      for (const part of g.wrap(line, w - 20)) wrapped.push(i === 0 ? `#${part}` : part)
    })
    const h = 12 + wrapped.length * 14
    const x = 208
    const y = this.infoBottom ? VIEW_H - h - 4 : 4
    g.nine('ui/hud', 'panel_stone', x, y, w, h)
    wrapped.forEach((line, i) => {
      const title = line.startsWith('#')
      g.text(title ? line.slice(1) : line, x + w / 2, y + 5 + i * 14, { align: 'center', color: title ? GOLD : CREAM })
    })
  }

  private drawPause(): void {
    const g = this.g
    this.veil(0.55)
    const w = 200
    const h = 168
    const x = (VIEW_W - w) / 2
    const y = (VIEW_H - h) / 2
    // swallow clicks that miss the buttons
    this.regions.push({ id: 'pause-panel', x: 0, y: 0, w: VIEW_W, h: VIEW_H, onClick: () => undefined })
    g.nine('ui/hud', 'panel_wood', x, y, w, h)
    g.text('TẠM DỪNG', VIEW_W / 2, y + 12, { size: 32, align: 'center', color: GOLD })
    const bx = VIEW_W / 2 - 70
    this.rectButton('pause-resume', 'Tiếp tục', bx, y + 54, 140, 'green', () => {
      this.paused = false
    })
    this.rectButton('pause-restart', 'Chơi lại', bx, y + 80, 140, 'green', () => this.startLevel(this.levelIndex))
    this.rectButton('pause-sound', `Âm thanh: ${this.sfx.muted ? 'Tắt' : 'Bật'}`, bx, y + 106, 140, 'green', () => this.toggleMute())
    this.rectButton('pause-quit', 'Về menu', bx, y + 132, 140, 'red', () => this.toMenu())
  }

  private drawResult(w: World): void {
    const g = this.g
    const win = w.result === 'win'
    const fade = Math.min(1, (this.resultT - 1.2) * 2.5)
    this.veil(0.6 * fade)
    if (fade < 1) return
    const pw = 260
    const ph = 188
    const x = (VIEW_W - pw) / 2
    const y = (VIEW_H - ph) / 2
    this.regions.push({ id: 'result-panel', x: 0, y: 0, w: VIEW_W, h: VIEW_H, onClick: () => undefined })
    g.nine('ui/hud', 'panel_parchment', x, y, pw, ph)
    g.text(win ? 'CHIẾN THẮNG' : 'THẤT THỦ', VIEW_W / 2, y + 22, {
      size: 48, align: 'center', color: win ? '#a8721a' : '#861c2a', outline: null,
    })
    if (win) {
      const stars = w.stars
      for (let s = 0; s < 3; s++) {
        // stars pop in one after another
        const shown = this.resultT - 1.8 - s * 0.35
        const lit = s < stars && shown > 0
        const grow = lit && shown < 0.15 ? 3 : 2
        const f = atlasFrame('ui/icons_16', 'star')
        g.frameScaled(
          'ui/icons_16', lit ? 'star' : 'star_empty',
          VIEW_W / 2 - 60 + s * 44 + 16 - (f.w * grow) / 2, y + 78 + 16 - (f.h * grow) / 2, grow,
        )
      }
      g.text(`Mạng còn lại: ${w.lives}/${w.level.lives}`, VIEW_W / 2, y + 120, {
        align: 'center', color: PARCHMENT_INK, outline: null,
      })
    } else {
      g.text(`Thành thất thủ ở đợt ${w.waveIndex + 1}/${w.waveCount}.`, VIEW_W / 2, y + 84, {
        align: 'center', color: PARCHMENT_INK, outline: null,
      })
      g.text(`Đã hạ ${w.kills} quái.`, VIEW_W / 2, y + 102, { align: 'center', color: PARCHMENT_INK, outline: null })
    }
    const hasNext = win && this.levelIndex < LEVELS.length - 1
    const by = y + ph - 34
    if (hasNext) {
      this.rectButton('result-next', 'Màn kế', x + 14, by, 74, 'green', () => this.startLevel(this.levelIndex + 1))
      this.rectButton('result-retry', 'Chơi lại', x + 93, by, 74, 'green', () => this.startLevel(this.levelIndex))
      this.rectButton('result-menu', 'Menu', x + 172, by, 74, 'red', () => this.toMenu())
    } else {
      this.rectButton('result-retry', 'Chơi lại', x + 30, by, 96, 'green', () => this.startLevel(this.levelIndex))
      this.rectButton('result-menu', 'Menu', x + 134, by, 96, 'red', () => this.toMenu())
    }
  }
}
