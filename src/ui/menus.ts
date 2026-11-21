import Phaser from 'phaser'
import { sfx } from '../app'
import { VIEW_H, VIEW_W } from '../data/levels'
import {
  MAX_LEVEL,
  MAX_SKILL_RANK,
  SKILL_INFO,
  SPECS,
  SPEC_CHOICES,
  TOWERS,
  TOWER_TYPES,
  skillText,
  towerStats,
  type TowerStats,
  type TowerType,
} from '../data/towers'
import type { Session } from '../session'
import type { Plot, Tower } from '../sim/types'
import type { RangeMarker } from '../view/battle-view'
import { Digits } from './text'
import { HUD, HitBox, RoundButton, icon, setFrame, sprite, type RoundButtonOptions } from './widgets'

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

function statLine(type: TowerType, stats: TowerStats, extra = ''): string {
  if (type === 'barracks') {
    return `Lính: ${stats.soldierHp} máu, sát thương ${stats.dmg[0]}-${stats.dmg[1]}, giáp ${Math.round(stats.soldierArmor * 100)}%`
  }
  const splash = stats.splash > 0 ? `, nổ lan ${stats.splash}` : ''
  return `Sát thương ${stats.dmg[0]}-${stats.dmg[1]}, nhịp ${stats.cooldown}s, tầm ${stats.range}${splash}${extra}`
}

function towerInfo(t: Tower, level: number): string {
  return statLine(t.type, towerStats(t.type, level, null), t.type === 'mage' && level >= MAX_LEVEL ? ', làm chậm' : '')
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
  opts: RoundButtonOptions = {},
): ActionButton {
  const slot = scene.add.container(0, 0)
  parent.add(slot)
  const button = new RoundButton(scene, -16, -16, name, onClick, opts, slot)
  const caption = new Digits(scene, 0, 10, '', 'center')
  slot.add(caption.obj)
  const check = icon(scene, 'check', -8, -8, slot).setVisible(false)
  return { slot, button, caption, check }
}

const PIP_ON = 0xffe27a
const PIP_OFF = 0x4a3324

/** One of the two buttons above a top-level tower: first a specialisation to pick, then a skill to train. */
interface BranchButton extends ActionButton {
  id: string
  /** one mark per skill rank, on a dark plate */
  pips: Phaser.GameObjects.Rectangle[]
  pipPlate: Phaser.GameObjects.Rectangle
}

/** Upgrade, specialisation, skill, sell and rally buttons around a built tower. */
export class TowerMenu {
  private readonly root: Phaser.GameObjects.Container
  private readonly upgrade: ActionButton
  private readonly branches: BranchButton[]
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
    this.branches = ([0, 1] as const).map((slot) => {
      const id = `tower-branch-${slot}`
      const b = actionButton(scene, this.root, 'round_blank', (pointer) => this.chooseBranch(slot, id, pointer.wasTouch), { icon: 'star' })
      const plateW = MAX_SKILL_RANK * 6 + 1
      const left = -Math.floor(plateW / 2)
      const pipPlate = scene.add.rectangle(left, -24, plateW, 6, 0x1d1322).setOrigin(0, 0)
      b.slot.add(pipPlate)
      const pips = Array.from({ length: MAX_SKILL_RANK }, (_, k) => {
        const pip = scene.add.rectangle(left + 1 + k * 6, -23, 5, 4, PIP_OFF).setOrigin(0, 0)
        b.slot.add(pip)
        return pip
      })
      return { ...b, id, pips, pipPlate }
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

  /** Picks the specialisation on that side, or trains the skill on that side once the tower has one. */
  private chooseBranch(slot: 0 | 1, id: string, touch: boolean): void {
    const s = this.session
    const w = s.world
    const t = this.tower
    if (!t) return
    if (t.spec) {
      const cost = w.skillCost(t, slot)
      if (cost === null || w.gold < cost) sfx.play('deny')
      else s.confirm(id, touch, () => void w.buySkill(t, slot))
      return
    }
    const spec = SPEC_CHOICES[t.type][slot]
    if (!w.canSpecialize(t, spec)) sfx.play('deny')
    else s.confirm(id, touch, () => void w.specialize(t, spec))
  }

  private hide(): void {
    if (!this.openFor) return
    this.openFor = null
    this.root.setVisible(false)
    this.upgrade.button.hit.reset()
    for (const b of this.branches) b.button.hit.reset()
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
    const spec = t.spec ? SPECS[t.spec] : null
    const state =
      t.buildT > 0 ? 'Đang xây...'
      : t.silenceT > 0 ? 'Bị yểm bùa: tạm thời không bắn được.'
      : spec ? statLine(t.type, spec)
      : towerInfo(t, t.level)
    f.info = [spec ? spec.name : `${def.name} cấp ${t.level + 1}`, state]
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

    this.updateBranches(f, t, zoom)

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

  /** The pair of buttons above a tower that reached level 3: two branches, then the two skills of the chosen one. */
  private updateBranches(f: HudFrame, t: Tower, zoom: number): void {
    const s = this.session
    const w = s.world
    const spec = t.spec ? SPECS[t.spec] : null
    const choices = SPEC_CHOICES[t.type]
    const choosing = w.awaitsSpec(t) && choices.some((id) => w.specAllowed(id))
    this.branches.forEach((b, i) => {
      const slot = i === 0 ? 0 : 1
      const visible = choosing || spec !== null
      b.slot.setVisible(visible)
      if (!visible) {
        b.button.hit.reset()
        return
      }
      b.slot.setPosition(Math.round((slot === 0 ? -24 : 24) * zoom), Math.round(-42 * zoom))
      const armed = s.armed === b.id
      const hot = b.button.hover || armed
      b.check.setVisible(armed)
      if (!spec) {
        const option = SPECS[choices[slot]]
        const allowed = w.specAllowed(option.id)
        const affordable = w.gold >= option.cost
        b.button.setIcon(allowed ? option.icon : 'lock').setState(!allowed || !affordable)
        b.caption.set(String(option.cost)).obj.setVisible(allowed).setAlpha(affordable ? 1 : 0.6)
        b.pipPlate.setVisible(false)
        for (const pip of b.pips) pip.setVisible(false)
        if (!hot) return
        if (!allowed) {
          f.info = [option.name, 'Nhánh này chưa mở ở màn chơi hiện tại.']
          return
        }
        f.info = [`${option.name}  -  ${option.cost} vàng`, option.blurb, statLine(t.type, option)]
        f.ranges.push({ x: t.x, y: t.y + 4, r: option.range, ok: affordable })
        return
      }
      const id = spec.skills[slot]
      const info = SKILL_INFO[id]
      const rank = t.skills[slot]
      const cost = w.skillCost(t, slot)
      const affordable = cost !== null && w.gold >= cost
      b.button.setIcon(info.icon).setState(cost !== null && !affordable)
      b.caption.set(cost === null ? '' : String(cost)).obj.setVisible(cost !== null).setAlpha(affordable ? 1 : 0.6)
      b.pipPlate.setVisible(true)
      b.pips.forEach((pip, k) => pip.setVisible(true).setFillStyle(k < rank ? PIP_ON : PIP_OFF))
      if (!hot) return
      f.info =
        cost === null
          ? [`${info.name}  -  đã tối đa`, skillText(id, rank)]
          : [`${info.name} bậc ${rank + 1}/${MAX_SKILL_RANK}  -  ${cost} vàng`, skillText(id, rank + 1)]
    })
  }
}
