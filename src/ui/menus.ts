import Phaser from 'phaser'
import { sfx } from '../app'
import { VIEW_H, VIEW_W } from '../data/levels'
import { MAX_LEVEL, TOWERS, TOWER_TYPES, type TowerType } from '../data/towers'
import type { Session } from '../session'
import type { Plot, Tower } from '../sim/types'
import type { RangeMarker } from '../view/battle-view'
import { Digits } from './text'
import { HUD, HitBox, RoundButton, icon, setFrame, sprite } from './widgets'

/** What the HUD collects over one frame while its parts update. */
export interface HudFrame {
  /** lines for the info panel; the last part to set it wins */
  info: string[] | null
  /** show the info panel at the bottom because a menu occupies the top */
  infoBottom: boolean
  ranges: RangeMarker[]
}

/** centre of each build option relative to the middle of the ring, at 1x zoom */
const RING_OFFSETS: readonly (readonly [number, number])[] = [
  [-30, -30],
  [30, -30],
  [-30, 28],
  [30, 28],
]

/** Scales a container up from slightly small when a menu opens. */
function popIn(scene: Phaser.Scene, root: Phaser.GameObjects.Container): void {
  scene.tweens.killTweensOf(root)
  root.setScale(0.7).setAlpha(0.4)
  scene.tweens.add({ targets: root, scale: 1, alpha: 1, duration: 130, ease: 'Back.easeOut' })
}

interface BuildOption {
  type: TowerType
  id: string
  /** holds the option; moves with the ring radius */
  slot: Phaser.GameObjects.Container
  offset: readonly [number, number]
  face: Phaser.GameObjects.Image
  cost: Digits
  check: Phaser.GameObjects.Image
  hit: HitBox
}

/** The ring of four tower choices around an empty plot. */
export class BuildMenu {
  private readonly root: Phaser.GameObjects.Container
  private readonly options: BuildOption[]
  private plot: Plot | null = null

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly session: Session,
    depth: number,
  ) {
    this.root = scene.add.container(0, 0).setDepth(depth).setVisible(false)
    this.options = TOWER_TYPES.map((type, i) => {
      const id = `build-${type}`
      const slot = scene.add.container(0, 0)
      this.root.add(slot)
      const face = sprite(scene, HUD, `build_${type}`, -18, -22, slot)
      const cost = new Digits(scene, 5, 10, '', 'center')
      slot.add(cost.obj)
      const check = icon(scene, 'check', -8, -12, slot).setVisible(false)
      const hit = new HitBox(scene, -18, -22, 36, 44, { onClick: (pointer) => this.choose(type, id, pointer.wasTouch) }, slot)
      return { type, id, slot, offset: RING_OFFSETS[i], face, cost, check, hit }
    })
  }

  private choose(type: TowerType, id: string, touch: boolean): void {
    const s = this.session
    const w = s.world
    const plot = this.plot
    if (!plot) return
    if (!w.level.towers.includes(type) || w.gold < TOWERS[type].cost[0]) {
      sfx.play('deny')
      return
    }
    s.confirm(id, touch, () => {
      if (w.build(plot.id, type)) s.clearSelection()
    })
  }

  /**
   * anchor is the plot position in HUD space and zoom the size of a world pixel
   * there, so the ring clears the plot at any camera zoom. plot null hides the menu.
   */
  update(f: HudFrame, plot: Plot | null, anchor: Phaser.Math.Vector2 | null, zoom = 1): void {
    if (!plot || !anchor) {
      if (this.plot) {
        this.plot = null
        this.root.setVisible(false)
        for (const o of this.options) o.hit.reset()
      }
      return
    }
    const s = this.session
    const w = s.world
    if (plot !== this.plot) {
      this.plot = plot
      this.root.setVisible(true)
      popIn(this.scene, this.root)
    }
    f.infoBottom = anchor.y < 190
    this.root.setPosition(
      Math.round(Phaser.Math.Clamp(anchor.x, 30 * zoom + 22, VIEW_W - 30 * zoom - 22)),
      Math.round(Phaser.Math.Clamp(anchor.y - 12 * zoom, 30 * zoom + 28, VIEW_H - 28 * zoom - 28)),
    )
    for (const o of this.options) {
      const def = TOWERS[o.type]
      const allowed = w.level.towers.includes(o.type)
      const cost = def.cost[0]
      const affordable = w.gold >= cost
      const armed = s.armed === o.id
      const hot = o.hit.hover || armed
      const lift = hot && allowed ? -1 : 0
      o.slot.setPosition(Math.round(o.offset[0] * zoom), Math.round(o.offset[1] * zoom) + lift)
      setFrame(o.face, allowed ? `build_${o.type}` : `build_${o.type}_locked`)
      o.face.setAlpha(allowed && !affordable ? 0.6 : 1)
      o.cost.obj.setVisible(allowed).setAlpha(affordable ? 1 : 0.55)
      o.cost.set(String(cost))
      o.check.setVisible(allowed && armed)
      if (hot && allowed) {
        f.info = [`${def.name}  -  ${cost} vàng`, def.blurb]
        f.ranges.push({ x: plot.x, y: plot.y + 4, r: def.range[0], ok: affordable })
      }
    }
  }
}

function towerInfo(t: Tower, level: number): string {
  const def = TOWERS[t.type]
  if (t.type === 'barracks') {
    return `Lính: ${def.soldierHp[level]} máu, sát thương ${def.dmg[level][0]}-${def.dmg[level][1]}, giáp ${Math.round(def.soldierArmor[level] * 100)}%`
  }
  const extra = t.type === 'artillery' ? `, nổ lan ${def.splash[level]}` : t.type === 'mage' && level >= MAX_LEVEL ? ', làm chậm' : ''
  return `Sát thương ${def.dmg[level][0]}-${def.dmg[level][1]}, nhịp ${def.cooldown[level]}s, tầm ${def.range[level]}${extra}`
}

/** A round button with a caption under it and a tick for touch confirmation, centred on its container. */
interface ActionButton {
  slot: Phaser.GameObjects.Container
  button: RoundButton
  caption: Digits
  check: Phaser.GameObjects.Image
}

function actionButton(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  name: string,
  onClick: (pointer: Phaser.Input.Pointer) => void,
): ActionButton {
  const slot = scene.add.container(0, 0)
  parent.add(slot)
  const button = new RoundButton(scene, -16, -16, name, onClick, {}, slot)
  const caption = new Digits(scene, 0, 10, '', 'center')
  slot.add(caption.obj)
  const check = icon(scene, 'check', -8, -8, slot).setVisible(false)
  return { slot, button, caption, check }
}

/** Upgrade, sell and rally buttons around a built tower. */
export class TowerMenu {
  private readonly root: Phaser.GameObjects.Container
  private readonly upgrade: ActionButton
  private readonly sell: ActionButton
  private readonly rally: ActionButton
  private tower: Tower | null = null
  /** the tower the buttons are currently popped open for */
  private openFor: Tower | null = null

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly session: Session,
    depth: number,
  ) {
    const s = session
    this.root = scene.add.container(0, 0).setDepth(depth).setVisible(false)
    this.upgrade = actionButton(scene, this.root, 'upgrade', (pointer) => {
      const t = this.tower
      if (t) s.confirm('tower-upgrade', pointer.wasTouch, () => void s.world.upgrade(t))
    })
    this.sell = actionButton(scene, this.root, 'sell', (pointer) => {
      const t = this.tower
      if (!t) return
      s.confirm('tower-sell', pointer.wasTouch, () => {
        if (s.world.sell(t)) s.clearSelection()
      })
    })
    this.rally = actionButton(scene, this.root, 'rally', () => s.startRally())
  }

  private hide(): void {
    if (!this.openFor) return
    this.openFor = null
    this.root.setVisible(false)
    this.upgrade.button.hit.reset()
    this.sell.button.hit.reset()
    this.rally.button.hit.reset()
  }

  /** anchor is the tower position in HUD space, zoom the size of a world pixel there; tower null hides the menu. */
  update(f: HudFrame, tower: Tower | null, anchor: Phaser.Math.Vector2 | null, zoom = 1): void {
    this.tower = tower
    if (!tower || !anchor) {
      this.hide()
      return
    }
    const s = this.session
    const w = s.world
    const t = tower
    const def = TOWERS[t.type]
    f.info = [`${def.name} cấp ${t.level + 1}`, t.buildT > 0 ? 'Đang xây...' : towerInfo(t, t.level)]
    f.infoBottom = anchor.y < 200
    if (s.mode !== 'normal') {
      this.hide()
      return
    }
    f.ranges.push({ x: t.x, y: t.y + 4, r: w.towerRange(t), ok: true })
    if (t.buildT > 0) {
      this.hide()
      return
    }
    if (this.openFor !== t) {
      this.openFor = t
      this.root.setVisible(true)
      popIn(this.scene, this.root)
    }
    this.root.setPosition(
      Math.round(Phaser.Math.Clamp(anchor.x, 44 * zoom + 16, VIEW_W - 44 * zoom - 16)),
      Math.round(Phaser.Math.Clamp(anchor.y - 26 * zoom, 42 * zoom + 42, VIEW_H - 46 * zoom - 30)),
    )
    this.upgrade.slot.setPosition(0, Math.round(-42 * zoom))
    this.sell.slot.setPosition(0, Math.round(46 * zoom))
    this.rally.slot.setPosition(Math.round(44 * zoom), Math.round(2 * zoom))

    const cost = w.upgradeCost(t)
    this.upgrade.slot.setVisible(cost !== null)
    if (cost === null) {
      this.upgrade.button.hit.reset()
    } else {
      const affordable = w.gold >= cost
      const armed = s.armed === 'tower-upgrade'
      this.upgrade.button.setState(!affordable)
      this.upgrade.caption.set(String(cost)).obj.setAlpha(affordable ? 1 : 0.6)
      this.upgrade.check.setVisible(armed)
      if (this.upgrade.button.hover || armed) {
        f.info = [`Nâng lên cấp ${t.level + 2}  -  ${cost} vàng`, towerInfo(t, t.level + 1)]
        f.ranges.push({ x: t.x, y: t.y + 4, r: def.range[t.level + 1], ok: affordable })
      }
    }

    const value = w.sellValue(t)
    const sellArmed = s.armed === 'tower-sell'
    this.sell.caption.set(`+${value}`)
    this.sell.check.setVisible(sellArmed)
    if (this.sell.button.hover || sellArmed) f.info = ['Bán tháp', `Hoàn lại ${value} vàng.`]

    const barracks = t.type === 'barracks'
    this.rally.slot.setVisible(barracks)
    this.rally.caption.obj.setVisible(false)
    if (!barracks) this.rally.button.hit.reset()
    else if (this.rally.button.hover) f.info = ['Điểm tập kết', 'Chọn nơi lính đứng chặn quái.']
  }
}
