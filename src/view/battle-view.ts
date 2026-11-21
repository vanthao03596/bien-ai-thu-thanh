import Phaser from 'phaser'
import { anim, frameNameAt, sheet } from '../assets'
import { RANGE_SQUASH, towerSheet } from '../data/towers'
import type { Effect, Enemy, FloatText, Plot, Projectile, RallyFlag, Soldier, Tower } from '../sim/types'
import { BUILD_TIME, type World } from '../sim/world'
import { Digits, digitsWidth } from '../ui/text'
import { FX_GLOW, Fx } from './fx'
import { MapView, type MapProp } from './map'

type Image = Phaser.GameObjects.Image
type Sprite = Phaser.GameObjects.Sprite

/** Draw order. Everything standing on the field sorts by its y, between groundFx and shots. */
const DEPTH = {
  ground: -1000,
  ranges: -900,
  groundFx: -800,
  shots: 1000,
  topFx: 1010,
  particles: 1020,
  bars: 1100,
  floats: 1200,
  preview: 1300,
} as const

const HUD_ATLAS = 'ui/hud'
const SLOW_TINT = 0xa9c8ff
const SELECT_COLOR = 0xfff07a
/** effect sheets that also glow: drawn a second time with additive blending */
const LUMINOUS: Record<string, number> = {
  'effects/explosion': 0.45,
  'effects/magic_hit': 0.6,
  'effects/upgrade_sparkle': 0.6,
  'effects/heal': 0.5,
  'effects/hero_respawn': 0.6,
  'effects/hit_spark': 0.6,
}

export function animKey(sheetKey: string, name: string): string {
  return `${sheetKey}:${name}`
}

export interface RangeMarker {
  x: number
  y: number
  r: number
  ok: boolean
}

/** What the player currently has selected; drives highlights. */
export interface Focus {
  plot: Plot | null
  tower: Tower | null
  hero: boolean
}

/** Pointer feedback the HUD paints onto the battlefield. */
export interface Overlay {
  hoverPlot: Plot | null
  ranges: RangeMarker[]
  rally: { x: number; y: number; ok: boolean } | null
}

export interface BattleViewHooks {
  /** gold was earned at this spot of the field */
  onCoin?: (x: number, y: number) => void
}

function setFrame(img: Image, frame: string): void {
  if (img.frame.name !== frame) img.setFrame(frame)
}

function setTexture(img: Image, key: string, frame: string): void {
  if (img.texture.key !== key) img.setTexture(key, frame)
  else if (img.frame.name !== frame) img.setFrame(frame)
}

/**
 * Keeps one view per simulation object. Objects the simulation dropped lose
 * their view on the next sync.
 */
class Views<E extends object, V> {
  private readonly map = new Map<E, V>()
  private readonly seen = new Set<E>()

  constructor(
    private readonly make: (e: E) => V,
    private readonly drop: (v: V) => void,
  ) {}

  sync(list: readonly E[], update: (e: E, v: V) => void): void {
    const seen = this.seen
    seen.clear()
    for (const e of list) {
      let v = this.map.get(e)
      if (v === undefined) {
        v = this.make(e)
        this.map.set(e, v)
      }
      update(e, v)
      seen.add(e)
    }
    if (this.map.size === seen.size) return
    for (const [e, v] of this.map) {
      if (seen.has(e)) continue
      this.drop(v)
      this.map.delete(e)
    }
  }

  get(e: E): V | undefined {
    return this.map.get(e)
  }
}

interface HpBar {
  frame: Image
  fill: Image
}

interface UnitView {
  shadow: Image
  body: Image
  rune: Sprite | null
  bar: HpBar | null
  lastHp: number
  /** seconds of white hit flash left */
  flash: number
  tint: 'none' | 'flash' | 'slow'
  dying: boolean
}

interface TowerView {
  body: Image
  units: Image[]
  built: boolean
}

interface PlotView {
  sprite: Sprite
  lit: boolean
}

interface ShotView {
  img: Image
  shadow: Image | null
  light: Image | null
  /** seconds until the next trail particle */
  trail: number
}

interface EffectView {
  img: Image
  glow: Image | null
}

interface FloatView {
  digits: Digits
  icon: Image | null
}

/**
 * Everything on the battlefield as Phaser game objects. The simulation stays the
 * single source of truth: each frame the view copies positions and animation
 * frames from it, and adds the purely visual layer (particles, lights, flashes).
 */
export class BattleView {
  readonly map: MapView
  readonly fx: Fx
  private time = 0
  private pace = 1
  private ambientT = 0

  private readonly ground: Image
  private readonly groundKeys: string[]
  private readonly rangeGfx: Phaser.GameObjects.Graphics
  private rangeKey = ''
  private readonly ringGfx: Phaser.GameObjects.Graphics
  private readonly rallyFlag: Sprite
  private readonly rallyPreview: Sprite
  private hoverPlot: Plot | null = null
  private readonly portals: { x: number; y: number }[] = []
  private readonly fires: { x: number; y: number }[] = []

  private readonly plots: PlotView[]
  private readonly towers: Views<Tower, TowerView>
  private readonly enemies: Views<Enemy, UnitView>
  private readonly soldiers: Views<Soldier, UnitView>
  private readonly shots: Views<Projectile, ShotView>
  private readonly effects: Views<Effect, EffectView>
  private readonly floats: Views<FloatText, FloatView>
  private readonly flags: Views<RallyFlag, Sprite>

  private glowTarget: Image | null = null

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly hooks: BattleViewHooks = {},
  ) {
    const add = scene.add
    this.map = new MapView(world.level)
    this.fx = new Fx(scene, DEPTH.particles)

    this.groundKeys = this.map.groundTextures(scene)
    this.ground = add.image(0, 0, this.groundKeys[0]).setOrigin(0, 0).setDepth(DEPTH.ground)
    this.rangeGfx = add.graphics().setDepth(DEPTH.ranges)
    this.ringGfx = add.graphics()

    for (const p of this.map.props) this.addProp(p)
    this.addSpawnDecor()
    const gate = world.gate
    add.sprite(gate.x, gate.y, 'props/kingdom_gate').play(animKey('props/kingdom_gate', 'loop')).setDepth(gate.y - 6)

    this.plots = world.plots.map((plot) => ({
      sprite: add.sprite(plot.x, plot.y, 'towers/build_plot', frameNameAt('towers/build_plot', 'idle', 0)).setDepth(plot.y - 6),
      lit: false,
    }))

    this.rallyFlag = add.sprite(0, 0, 'ui/rally_flag').play(animKey('ui/rally_flag', 'wave')).setVisible(false)
    this.rallyPreview = add
      .sprite(0, 0, 'ui/rally_flag')
      .play(animKey('ui/rally_flag', 'wave'))
      .setDepth(DEPTH.preview)
      .setVisible(false)

    this.towers = new Views<Tower, TowerView>(
      (t) => ({ body: add.image(t.x, t.y, 'towers/construction'), units: [], built: false }),
      (v) => {
        if (this.glowTarget === v.body) this.glowTarget = null
        v.body.destroy()
        for (const u of v.units) u.destroy()
      },
    )
    this.enemies = new Views<Enemy, UnitView>(
      (e) => this.makeUnit(e.def.sheet, e.def.shadow, e.hp),
      (v) => this.dropUnit(v),
    )
    this.soldiers = new Views<Soldier, UnitView>(
      (s) => this.makeUnit(s.sheet, 'effects/shadow_small', s.hp),
      (v) => this.dropUnit(v),
    )
    this.shots = new Views<Projectile, ShotView>(
      (p) => this.makeShot(p),
      (v) => {
        v.img.destroy()
        v.shadow?.destroy()
        v.light?.destroy()
      },
    )
    this.effects = new Views<Effect, EffectView>(
      (fx) => this.makeEffect(fx),
      (v) => {
        v.img.destroy()
        v.glow?.destroy()
      },
    )
    this.floats = new Views<FloatText, FloatView>(
      (f) => this.makeFloat(f),
      (v) => {
        v.digits.obj.destroy()
        v.icon?.destroy()
      },
    )
    this.flags = new Views<RallyFlag, Sprite>(
      (f) => add.sprite(Math.round(f.x), Math.round(f.y), 'ui/rally_flag').setDepth(f.y),
      (v) => v.destroy(),
    )
  }

  // ------------------------------------------------------------ scenery

  private addProp(p: MapProp): void {
    const add = this.scene.add
    if (p.kind === 'static') {
      add.image(p.x, p.y, 'props/props_static', p.frame).setDepth(p.y)
      return
    }
    const key =
      p.kind === 'oak' ? 'props/oak_tree_sway'
      : p.kind === 'pine' ? 'props/pine_tree_sway'
      : p.kind === 'campfire' ? 'props/campfire'
      : 'props/tall_grass_sway'
    const a = anim(key, 'loop')
    // neighbours start on different frames so they do not sway in sync
    const startFrame = Math.floor(p.phase * a.fps) % a.frames
    add.sprite(p.x, p.y, key).play({ key: animKey(key, 'loop'), startFrame }).setDepth(p.y)
    if (p.kind === 'campfire') {
      this.fires.push({ x: p.x, y: p.y - 8 })
      this.fx.light(p.x, p.y - 8, 0xff9a3c, 72, 0.4)
    }
  }

  private addSpawnDecor(): void {
    const add = this.scene.add
    this.map.spawnPoints.forEach((p, i) => {
      const kind = this.world.level.spawns[i]
      if (kind === 'portal') {
        add.sprite(p.x, p.y + 6, 'effects/portal').play(animKey('effects/portal', 'play')).setDepth(p.y - 4)
        this.portals.push({ x: p.x, y: p.y - 10 })
        this.fx.light(p.x, p.y - 10, 0x9b6bff, 84, 0.45)
      } else if (kind === 'cave') {
        add.image(p.x - 4, p.y + 14, 'props/props_static', 'cave_entrance').setDepth(p.y + 14)
      }
    })
  }

  // ------------------------------------------------------------ view factories

  private makeUnit(sheetKey: string, shadowKey: string, hp: number): UnitView {
    const add = this.scene.add
    return {
      shadow: add.image(0, 0, shadowKey),
      body: add.image(0, 0, sheetKey),
      rune: null,
      bar: null,
      lastHp: hp,
      flash: 0,
      tint: 'none',
      dying: false,
    }
  }

  private dropUnit(v: UnitView): void {
    if (this.glowTarget === v.body) this.glowTarget = null
    v.shadow.destroy()
    v.body.destroy()
    v.rune?.destroy()
    v.bar?.frame.destroy()
    v.bar?.fill.destroy()
  }

  private light(color: number, size: number, alpha: number): Image {
    return this.scene.add
      .image(0, 0, FX_GLOW)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setDisplaySize(size, size)
      .setAlpha(alpha)
      .setDepth(DEPTH.shots - 1)
  }

  private makeShot(p: Projectile): ShotView {
    const add = this.scene.add
    const loop = (key: string): Image => add.sprite(0, 0, key).play(animKey(key, 'fly'))
    let img: Image
    let shadow: Image | null = null
    let light: Image | null = null
    switch (p.kind) {
      case 'arrow':
        img = add.image(0, 0, 'projectiles/arrow')
        break
      case 'bolt':
        img = loop('projectiles/magic_bolt')
        light = this.light(0xa97bff, 30, 0.6)
        break
      case 'bomb':
        img = loop('projectiles/bomb')
        shadow = add.image(0, 0, 'effects/shadow_small').setAlpha(0.6).setDepth(DEPTH.shots - 2)
        break
      case 'fireball':
        img = loop('projectiles/fireball')
        light = this.light(0xff8a3c, 44, 0.7)
        break
      case 'heal':
        img = loop('projectiles/heal_orb')
        light = this.light(0x7dff9a, 26, 0.5)
        break
    }
    img.setDepth(DEPTH.shots)
    return { img, shadow, light, trail: 0 }
  }

  private makeEffect(fx: Effect): EffectView {
    const add = this.scene.add
    const depth = fx.layer === 'ground' ? DEPTH.groundFx : DEPTH.topFx
    const x = Math.round(fx.x)
    const y = Math.round(fx.y)
    const img = add.image(x, y, fx.sheet).setDepth(depth)
    const strength = LUMINOUS[fx.sheet]
    const glow =
      strength === undefined
        ? null
        : add.image(x, y, fx.sheet).setDepth(depth + 0.5).setBlendMode(Phaser.BlendModes.ADD).setAlpha(strength)
    this.onEffect(fx.sheet, x, y)
    return { img, glow }
  }

  /** The simulation announces what happened through its effect sprites; particles and light ride along. */
  private onEffect(sheetKey: string, x: number, y: number): void {
    const fx = this.fx
    switch (sheetKey) {
      case 'effects/explosion':
        fx.blast(x, y - 4)
        break
      case 'effects/hit_spark':
        fx.sparks(x, y)
        break
      case 'effects/magic_hit':
        fx.magic(x, y)
        fx.flash(x, y, 0xa97bff, 44, 220)
        break
      case 'effects/dust':
        fx.dust(x, y - 2)
        break
      case 'effects/smoke_puff':
        fx.smoke(x, y - 6)
        break
      case 'effects/heal':
        fx.heal(x, y)
        break
      case 'effects/upgrade_sparkle':
        fx.gold(x, y - 26, 16)
        fx.flash(x, y - 26, 0xffe27a, 80, 320)
        break
      case 'effects/hero_respawn':
        fx.gold(x, y - 16, 14)
        fx.flash(x, y - 14, 0xfff6c2, 70, 360)
        break
    }
  }

  private makeFloat(f: FloatText): FloatView {
    const add = this.scene.add
    const digits = new Digits(this.scene, 0, 0, f.text)
    digits.obj.setDepth(DEPTH.floats)
    let icon: Image | null = null
    if (f.icon === 'coin') {
      icon = add.image(0, 0, 'effects/coin_spin').setDepth(DEPTH.floats)
      this.hooks.onCoin?.(f.x, f.y)
    } else if (f.icon === 'heart') {
      icon = add.image(0, 0, 'ui/icons_16', 'heart').setOrigin(0, 0).setDepth(DEPTH.floats)
    }
    return { digits, icon }
  }

  private bar(v: UnitView): HpBar {
    if (!v.bar) {
      const add = this.scene.add
      v.bar = {
        frame: add.image(0, 0, HUD_ATLAS, 'hp_frame').setOrigin(0, 0).setDepth(DEPTH.bars),
        fill: add.image(0, 0, HUD_ATLAS, 'hp_fill_green').setOrigin(0, 0).setDepth(DEPTH.bars + 1),
      }
    }
    return v.bar
  }

  // ------------------------------------------------------------ per-frame sync

  /**
   * Copies the state of the simulation onto the game objects.
   * dt is wall-clock seconds; pace is 0 while paused, otherwise the game speed.
   */
  update(dt: number, focus: Focus, pace: number): void {
    const w = this.world
    this.time += dt
    this.pace = pace
    this.fx.setTimeScale(pace)

    const groundKey = this.groundKeys[Math.floor(this.time * 4) % this.groundKeys.length]
    if (this.ground.texture.key !== groundKey) this.ground.setTexture(groundKey)

    w.plots.forEach((plot, i) => this.syncPlot(plot, this.plots[i], focus))
    this.towers.sync(w.towers, (t, v) => this.syncTower(t, v))
    this.enemies.sync(w.enemies, (e, v) => this.syncEnemy(e, v, dt))
    this.soldiers.sync(w.soldiers, (s, v) => this.syncSoldier(s, v, dt))
    this.shots.sync(w.projectiles, (p, v) => this.syncShot(p, v, dt))
    this.effects.sync(w.effects, (fx, v) => {
      const frame = frameNameAt(fx.sheet, 'play', fx.t)
      setFrame(v.img, frame)
      if (v.glow) setFrame(v.glow, frame)
    })
    this.floats.sync(w.floats, (f, v) => this.syncFloat(f, v))
    this.flags.sync(w.flags, (f, v) => {
      setFrame(v, frameNameAt('ui/rally_flag', 'wave', f.t))
      v.setAlpha(Phaser.Math.Clamp((2.5 - f.t) * 2, 0, 1))
    })

    const sel = focus.tower
    const showRally = sel !== null && sel.type === 'barracks' && sel.buildT <= 0
    this.rallyFlag.setVisible(showRally)
    if (showRally && sel) this.rallyFlag.setPosition(Math.round(sel.rally.x), Math.round(sel.rally.y)).setDepth(sel.rally.y)

    this.syncSelection(focus)
    if (pace > 0) this.ambient(dt)
  }

  private syncPlot(plot: Plot, v: PlotView, focus: Focus): void {
    const t = plot.tower
    v.sprite.setVisible(t === null || t.buildT > 0)
    const lit = t === null && (plot === this.hoverPlot || plot === focus.plot)
    if (lit === v.lit) return
    v.lit = lit
    if (lit) {
      v.sprite.play(animKey('towers/build_plot', 'hover'))
    } else {
      v.sprite.stop()
      v.sprite.setFrame(frameNameAt('towers/build_plot', 'idle', 0))
    }
  }

  private syncTower(t: Tower, v: TowerView): void {
    v.body.setDepth(t.y)
    if (t.buildT > 0) {
      setTexture(v.body, 'towers/construction', frameNameAt('towers/construction', 'build', BUILD_TIME - t.buildT))
      return
    }
    v.built = true
    const key = towerSheet(t.type, t.level)
    const s = sheet(key)
    let frame: string
    if (t.type === 'barracks') {
      frame = t.doorT >= 0 ? frameNameAt(key, 'door', t.doorT) : frameNameAt(key, 'idle', t.animT)
    } else if (t.attackT >= 0 && s.anims.attack) {
      frame = frameNameAt(key, 'attack', t.attackT)
    } else {
      frame = frameNameAt(key, 'idle', t.animT)
    }
    setTexture(v.body, key, frame)
    if (t.type === 'barracks') return

    const ox = t.x - s.ax
    const oy = t.y - s.ay
    const unitKey = t.type === 'archer' ? 'units/archer_unit' : 'units/mage_unit'
    t.units.forEach((u, i) => {
      const slot = s.unitSlots[i]
      if (!slot) return
      let img = v.units[i]
      if (!img) {
        img = this.scene.add.image(0, 0, unitKey)
        v.units[i] = img
      }
      const busy = u.shootT >= 0
      let unitFrame: string
      if (t.type === 'archer') {
        unitFrame = frameNameAt(unitKey, `${busy ? 'shoot' : 'idle'}_${u.dir}`, busy ? u.shootT : t.animT + i * 0.4)
        img.setFlipX(u.dir === 'side' && u.flip)
      } else {
        unitFrame = frameNameAt(unitKey, busy ? 'cast' : 'idle', busy ? u.shootT : t.animT)
      }
      setFrame(img, unitFrame)
      img.setPosition(ox + slot.x, oy + slot.y).setDepth(t.y + 0.01 + i * 0.001)
    })
  }

  /** White flash when the unit lost health since the last frame, otherwise its resting tint. */
  private tintUnit(v: UnitView, hp: number, dt: number, slowed: boolean): void {
    if (hp < v.lastHp - 0.001) v.flash = 0.09
    v.lastHp = hp
    let want: UnitView['tint'] = slowed ? 'slow' : 'none'
    if (v.flash > 0) {
      v.flash -= dt
      want = 'flash'
    }
    if (want === v.tint) return
    v.tint = want
    if (want === 'flash') v.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)
    else v.body.setTint(want === 'slow' ? SLOW_TINT : 0xffffff).setTintMode(Phaser.TintModes.MULTIPLY)
  }

  private syncBar(v: UnitView, show: boolean, x: number, y: number, ratio: number): void {
    if (!show) {
      if (v.bar) {
        v.bar.frame.setVisible(false)
        v.bar.fill.setVisible(false)
      }
      return
    }
    const bar = this.bar(v)
    const left = Math.round(x) - 10
    const top = Math.round(y)
    bar.frame.setVisible(true).setPosition(left, top)
    setFrame(bar.fill, ratio > 0.5 ? 'hp_fill_green' : ratio > 0.25 ? 'hp_fill_yellow' : 'hp_fill_red')
    bar.fill
      .setVisible(true)
      .setPosition(left + 1, top + 1)
      .setCrop(0, 0, Math.max(1, Math.round(18 * ratio)), 3)
  }

  private syncEnemy(e: Enemy, v: UnitView, dt: number): void {
    const def = e.def
    const dying = e.state === 'dying'
    const x = Math.round(e.x)
    const y = Math.round(e.y)
    const alpha = dying ? 1 : Math.min(1, e.age / 0.35)
    // flying units sort by their ground position but always pass over walkers nearby
    const depth = e.y + (def.flying ? 6 : 0)

    v.shadow
      .setVisible(!dying || def.flying)
      .setPosition(x, y + (def.flying ? 2 : 0))
      .setAlpha(alpha * 0.9)
      .setDepth(depth - 0.02)

    const slowed = e.slowT > 0 && !dying
    if (slowed && !v.rune) {
      v.rune = this.scene.add.sprite(x, y, 'effects/slow_rune').play(animKey('effects/slow_rune', 'play')).setAlpha(0.9)
    }
    if (v.rune) v.rune.setVisible(slowed).setPosition(x, y).setDepth(depth - 0.01)

    const vertical = e.anim === 'walk_down' || e.anim === 'walk_up'
    const lift = def.flying && !dying ? Math.round(Math.sin(this.time * 5 + e.id) * 1.5) : 0
    setFrame(v.body, frameNameAt(def.sheet, e.anim, e.animT))
    v.body
      .setPosition(x, y + lift)
      .setFlipX(!vertical && e.flip)
      .setAlpha(alpha)
      .setDepth(depth)
    this.tintUnit(v, e.hp, dt, slowed)

    if (dying && !v.dying) {
      v.dying = true
      this.fx.death(x, y - def.height * 0.5, def.boss ? 40 : def.radius >= 10 ? 14 : 6)
      if (def.boss) this.fx.flash(x, y - def.height * 0.5, 0xff5a3c, 220, 700)
    }
    this.syncBar(v, !dying && !def.boss && e.hp < def.hp, e.x, e.y - def.height - 7, e.hp / def.hp)
  }

  private syncSoldier(s: Soldier, v: UnitView, dt: number): void {
    const gone = s.state === 'dead'
    const dying = s.state === 'dying'
    v.body.setVisible(!gone)
    v.shadow.setVisible(!gone && !dying)
    if (gone) {
      this.syncBar(v, false, 0, 0, 0)
      v.lastHp = s.hp
      return
    }
    const x = Math.round(s.x)
    const y = Math.round(s.y)
    const depth = s.y + 0.5
    v.shadow.setPosition(x, y).setDepth(depth - 0.02)
    const vertical = s.anim === 'walk_down' || s.anim === 'walk_up'
    // reinforcements blink shortly before their time is up
    const alpha = s.life < 1.5 && !dying ? 0.55 + 0.45 * Math.abs(Math.sin(this.time * 10)) : 1
    setFrame(v.body, frameNameAt(s.sheet, s.anim, s.animT))
    v.body
      .setPosition(x, y)
      .setFlipX(!vertical && s.flip)
      .setAlpha(alpha)
      .setDepth(depth)
    this.tintUnit(v, s.hp, dt, false)
    this.syncBar(v, !dying && (s.hp < s.maxHp || s === this.world.hero), s.x, s.y - 30, s.hp / s.maxHp)
  }

  private syncShot(p: Projectile, v: ShotView, dt: number): void {
    const flying = p.t >= 0
    v.img.setVisible(flying)
    v.shadow?.setVisible(flying)
    v.light?.setVisible(flying)
    if (!flying) return
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    v.img.setPosition(x, y)
    v.light?.setPosition(x, y)
    if (p.kind === 'arrow') {
      const step = (Math.PI * 2) / 16
      const frame = ((Math.round(p.angle / step) % 16) + 16) % 16
      setFrame(v.img, anim('projectiles/arrow', 'fly_16dir').names[frame])
    } else if (p.kind === 'bomb' && v.shadow) {
      // the shadow travels on the ground under the arc
      const k = Math.min(1, p.t / p.dur)
      v.shadow.setPosition(Math.round(p.sx + (p.tx - p.sx) * k), Math.round(p.sy + 26 + (p.ty - p.sy - 26) * k))
    }
    if (this.pace <= 0 || (p.kind !== 'fireball' && p.kind !== 'bolt')) return
    v.trail -= dt * this.pace
    if (v.trail > 0) return
    v.trail = 0.035
    if (p.kind === 'fireball') this.fx.ember(x, y, 2)
    else this.fx.magic(x, y, 1)
  }

  private syncFloat(f: FloatText, v: FloatView): void {
    const rise = f.t * 16
    const alpha = Phaser.Math.Clamp((1 - f.t) * 3, 0, 1)
    const pad = f.icon === 'coin' ? 13 : f.icon === 'heart' ? 17 : 0
    const left = Math.round(f.x - (digitsWidth(f.text) + pad) / 2)
    if (v.icon) {
      if (f.icon === 'coin') {
        setFrame(v.icon, frameNameAt('effects/coin_spin', 'play', f.t))
        v.icon.setPosition(left + 6, Math.round(f.y - rise + 5))
      } else {
        v.icon.setPosition(left, Math.round(f.y - rise - 3))
      }
      v.icon.setAlpha(alpha)
    }
    v.digits.moveTo(left + pad, f.y - rise)
    v.digits.obj.setAlpha(alpha)
  }

  /** Outline glow on the selected tower or hero, and the pulsing ring under the hero. */
  private syncSelection(focus: Focus): void {
    const hero = this.world.hero
    const heroView = this.soldiers.get(hero)
    const heroUp = hero.state !== 'dead' && hero.state !== 'dying'
    const towerView = focus.tower ? this.towers.get(focus.tower) : undefined
    let target: Image | null = null
    if (towerView && towerView.built) target = towerView.body
    else if (focus.hero && heroView && heroUp) target = heroView.body
    this.setGlow(target)

    const ring = this.ringGfx
    ring.clear()
    if (!focus.hero || !heroUp) return
    const pulse = 1 + Math.round(Math.sin(this.time * 6))
    const rx = 11 + pulse
    const ry = 5 + pulse * 0.5
    const n = Math.round((rx + ry) * 3)
    ring.fillStyle(SELECT_COLOR, 1)
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      ring.fillRect(Math.round(hero.x + Math.cos(a) * rx), Math.round(hero.y + Math.sin(a) * ry), 1, 1)
    }
    ring.setDepth(hero.y + 0.49)
  }

  private setGlow(target: Image | null): void {
    if (target === this.glowTarget) return
    this.glowTarget?.filters?.internal.clear()
    this.glowTarget = target
    if (!target) return
    target.enableFilters()
    target.filters?.internal.addGlow(SELECT_COLOR, 3, 0, 1, false, 8, 3)
  }

  /** Idle sparks around fires and portals. */
  private ambient(dt: number): void {
    this.ambientT -= dt
    if (this.ambientT > 0) return
    this.ambientT = 0.18
    for (const f of this.fires) {
      if (Math.random() < 0.6) this.fx.ember(f.x + Phaser.Math.Between(-3, 3), f.y, 1)
    }
    for (const p of this.portals) {
      this.fx.magic(p.x + Phaser.Math.Between(-10, 10), p.y + Phaser.Math.Between(-12, 10), 1)
    }
  }

  // ------------------------------------------------------------ pointer feedback

  setOverlay(o: Overlay): void {
    this.hoverPlot = o.hoverPlot
    this.drawRanges(o.ranges)
    const r = o.rally
    this.rallyPreview.setVisible(r !== null)
    if (r) this.rallyPreview.setPosition(Math.round(r.x), Math.round(r.y)).setAlpha(r.ok ? 0.9 : 0.35)
  }

  /** Dotted ellipses with a faint fill, in the style of the range sprites of the pack. */
  private drawRanges(ranges: RangeMarker[]): void {
    const key = ranges.map((r) => `${Math.round(r.x)},${Math.round(r.y)},${r.r},${r.ok ? 1 : 0}`).join('|')
    if (key === this.rangeKey) return
    this.rangeKey = key
    const g = this.rangeGfx
    g.clear()
    for (const r of ranges) {
      const cx = Math.round(r.x)
      const cy = Math.round(r.y - 4)
      const rx = r.r
      const ry = r.r * RANGE_SQUASH
      const color = r.ok ? 0xfff0a0 : 0xff5a50
      g.fillStyle(color, 0.2)
      g.fillEllipse(cx, cy, rx * 2, ry * 2, 48)
      g.fillStyle(color, 0.95)
      const n = Math.max(24, Math.round((rx + ry) * 0.22) * 2)
      for (let k = 0; k < n; k += 2) {
        const a = (k / n) * Math.PI * 2
        g.fillRect(Math.round(cx + Math.cos(a) * rx) - 1, Math.round(cy + Math.sin(a) * ry), 3, 2)
      }
    }
  }
}
