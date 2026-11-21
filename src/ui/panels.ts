import Phaser from 'phaser'
import { MAX_STARS, save, showMenu, startLevel, toggleMute, totalStars } from '../app'
import { DIFFICULTY } from '../data/difficulty'
import { LEVELS, VIEW_H, VIEW_W } from '../data/levels'
import type { Session } from '../session'
import type { World } from '../sim/world'
import type { Fx } from '../view/fx'
import { CREAM, GOLD, PARCHMENT_INK, label, wrapText } from './text'
import { HUD, HitBox, ICONS, RectButton, panel, resizePanel, setFrame, sprite, veil } from './widgets'

function soundLabel(): string {
  return `Âm thanh: ${save.muted ? 'Tắt' : 'Bật'}`
}

/** The two-line hint box at the top (or bottom) of the screen. */
export class InfoPanel {
  private readonly root: Phaser.GameObjects.Container
  private readonly box: Phaser.GameObjects.NineSlice
  private readonly lines: Phaser.GameObjects.Text[] = []
  private readonly lineDy: number
  private key = ''
  private height = 0

  constructor(private readonly scene: Phaser.Scene, depth: number) {
    this.root = scene.add.container(0, 0).setDepth(depth).setVisible(false)
    this.box = panel(scene, 'panel_stone', 0, 0, InfoPanel.W, 26, this.root)
    const probe = label(scene, 0, 0, '')
    this.lineDy = probe.y
    probe.destroy()
  }

  static readonly X = 208
  static readonly W = 352

  /** The first line is the title; every line wraps to the panel width. */
  show(lines: string[] | null, bottom: boolean): void {
    if (!lines) {
      this.root.setVisible(false)
      return
    }
    const key = lines.join('\n')
    if (key !== this.key) {
      this.key = key
      const wrapped: { text: string; title: boolean }[] = []
      lines.forEach((line, i) => {
        for (const part of wrapText(line, InfoPanel.W - 20)) wrapped.push({ text: part, title: i === 0 })
      })
      this.height = 12 + wrapped.length * 14
      resizePanel(this.box, InfoPanel.W, this.height)
      wrapped.forEach((line, i) => {
        let t = this.lines[i]
        if (!t) {
          t = label(this.scene, InfoPanel.W / 2, 0, '', { align: 'center' })
          this.root.add(t)
          this.lines[i] = t
        }
        t.setText(line.text).setColor(line.title ? GOLD : CREAM).setVisible(true)
        t.y = 5 + i * 14 + this.lineDy
      })
      for (let i = wrapped.length; i < this.lines.length; i++) this.lines[i].setVisible(false)
    }
    this.root.setPosition(InfoPanel.X, bottom ? VIEW_H - this.height - 4 : 4).setVisible(true)
  }
}

/** Health of the boss, shown at the bottom centre while it is on the field. */
export class BossBar {
  /** a boss is on the field and the bar occupies the bottom centre */
  visible = false
  private readonly frame: Phaser.GameObjects.Image
  private readonly fill: Phaser.GameObjects.Image

  constructor(scene: Phaser.Scene, depth: number) {
    const x = Math.round(VIEW_W / 2 - 52)
    const y = VIEW_H - 26
    this.frame = sprite(scene, HUD, 'boss_bar_frame', x, y).setDepth(depth).setVisible(false)
    this.fill = sprite(scene, HUD, 'boss_bar_fill', x + 7, y + 8).setDepth(depth).setVisible(false)
  }

  update(world: World): void {
    let ratio = -1
    for (const e of world.enemies) {
      if (e.def.boss && e.state !== 'dying') ratio = Math.max(0, e.hp / e.def.hp)
    }
    const visible = ratio >= 0
    this.visible = visible
    this.frame.setVisible(visible)
    this.fill.setVisible(visible && ratio > 0)
    if (visible && ratio > 0) this.fill.setCrop(0, 0, Math.max(1, Math.round(90 * ratio)), 4)
  }
}

/** Dimmer plus a full-screen pointer shield, shared by the modal panels. */
function modal(scene: Phaser.Scene, depth: number, dim: number): { root: Phaser.GameObjects.Container; dimmer: Phaser.GameObjects.Rectangle } {
  const root = scene.add.container(0, 0).setDepth(depth).setVisible(false)
  const dimmer = veil(scene, dim, root)
  // swallows clicks that miss the buttons
  new HitBox(scene, 0, 0, VIEW_W, VIEW_H, {}, root, false)
  return { root, dimmer }
}

export class PausePanel {
  private readonly root: Phaser.GameObjects.Container
  private readonly box: Phaser.GameObjects.Container
  private readonly boxY: number
  private readonly sound: RectButton
  private open = false

  constructor(private readonly scene: Phaser.Scene, session: Session, depth: number) {
    const w = 200
    const h = 168
    const x = (VIEW_W - w) / 2
    this.boxY = (VIEW_H - h) / 2
    const { root } = modal(scene, depth, 0.55)
    this.root = root
    this.box = scene.add.container(x, this.boxY)
    root.add(this.box)
    panel(scene, 'panel_wood', 0, 0, w, h, this.box)
    this.box.add(label(scene, w / 2, 12, 'TẠM DỪNG', { size: 32, align: 'center', color: GOLD }))
    const bx = w / 2 - 70
    new RectButton(scene, bx, 54, 140, 'Tiếp tục', 'green', () => { session.paused = false }, this.box)
    new RectButton(scene, bx, 80, 140, 'Chơi lại', 'green', () => startLevel(scene, session.levelIndex), this.box)
    this.sound = new RectButton(scene, bx, 106, 140, soundLabel(), 'green', () => toggleMute(scene.game), this.box)
    new RectButton(scene, bx, 132, 140, 'Về menu', 'red', () => showMenu(scene, 'levels'), this.box)
  }

  update(open: boolean): void {
    if (open) this.sound.setText(soundLabel())
    if (open === this.open) return
    this.open = open
    this.root.setVisible(open)
    this.scene.tweens.killTweensOf(this.box)
    if (!open) return
    // the panel drops in from just above its resting place
    this.box.setPosition(this.box.x, this.boxY - 18).setAlpha(0)
    this.scene.tweens.add({ targets: this.box, y: this.boxY, alpha: 1, duration: 180, ease: 'Back.easeOut' })
  }
}

/** Victory or defeat: fades the field, slides the parchment in and pops the stars one by one. */
export class ResultPanel {
  private shown = false

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly session: Session,
    private readonly fx: Fx,
    private readonly depth: number,
  ) {}

  update(): void {
    const s = this.session
    if (this.shown || s.world.result === null || s.resultT <= 1.2) return
    this.shown = true
    this.build(s.world)
  }

  private build(w: World): void {
    const scene = this.scene
    const s = this.session
    const win = w.result === 'win'
    // winning the last level ends the campaign: a taller sheet with the closing words
    const finale = win && s.levelIndex === LEVELS.length - 1
    const pw = finale ? 300 : 260
    const ph = finale ? 228 : 188
    const x = (VIEW_W - pw) / 2
    const y = (VIEW_H - ph) / 2
    const { root, dimmer } = modal(scene, this.depth, 0.6)
    root.setVisible(true)
    dimmer.setAlpha(0)
    scene.tweens.add({ targets: dimmer, alpha: 1, duration: 400 })

    const box = scene.add.container(x, y + 30).setAlpha(0)
    root.add(box)
    panel(scene, 'panel_parchment', 0, 0, pw, ph, box)
    box.add(
      label(scene, pw / 2, 22, finale ? 'TOÀN THẮNG' : win ? 'CHIẾN THẮNG' : 'THẤT THỦ', {
        size: 48, align: 'center', color: win ? '#a8721a' : '#861c2a', outline: null,
      }),
    )
    const plain = { align: 'center', color: PARCHMENT_INK, outline: null } as const
    const stars: Phaser.GameObjects.Image[] = []
    if (win) {
      for (let i = 0; i < 3; i++) {
        // origin in the middle so the pop grows from the centre of the star
        const star = scene.add.image(pw / 2 - 44 + i * 44, 94, ICONS, 'star_empty').setScale(2)
        box.add(star)
        stars.push(star)
      }
      box.add(label(scene, pw / 2, 120, `Mạng còn lại: ${w.lives}/${w.level.lives}  -  Độ khó: ${DIFFICULTY[w.difficulty].name}`, plain))
      if (finale) {
        // the win of this battle is already in the save when the sheet is built
        const total = totalStars()
        box.add(label(scene, pw / 2, 140, 'Quỷ vương đã bại. Biên ải yên bình trở lại.', plain))
        box.add(label(scene, pw / 2, 156, `Tổng số sao: ${total}/${MAX_STARS}`, { ...plain, color: '#a8721a' }))
        if (total < MAX_STARS) box.add(label(scene, pw / 2, 172, 'Chơi lại các màn để gom đủ sao.', plain))
      }
    } else {
      box.add(label(scene, pw / 2, 84, `Thành thất thủ ở đợt ${w.waveIndex + 1}/${w.waveCount}.`, plain))
      box.add(label(scene, pw / 2, 102, `Đã hạ ${w.kills} quái.`, plain))
    }

    const by = ph - 34
    const retry = (): void => startLevel(scene, s.levelIndex)
    const menu = (): void => showMenu(scene, 'levels')
    if (win && s.levelIndex < LEVELS.length - 1) {
      new RectButton(scene, 14, by, 74, 'Màn kế', 'green', () => startLevel(scene, s.levelIndex + 1), box)
      new RectButton(scene, 93, by, 74, 'Chơi lại', 'green', retry, box)
      new RectButton(scene, 172, by, 74, 'Menu', 'red', menu, box)
    } else {
      new RectButton(scene, pw / 2 - 100, by, 96, 'Chơi lại', 'green', retry, box)
      new RectButton(scene, pw / 2 + 4, by, 96, 'Menu', 'red', menu, box)
    }

    scene.tweens.add({ targets: box, y, alpha: 1, delay: 300, duration: 320, ease: 'Back.easeOut' })
    stars.forEach((star, i) => {
      if (i >= w.stars) return
      scene.time.delayedCall(760 + i * 350, () => {
        setFrame(star, 'star')
        star.setScale(3.4)
        scene.tweens.add({ targets: star, scale: 2, duration: 240, ease: 'Back.easeOut' })
        this.fx.gold(x + star.x, y + star.y, 14)
        this.fx.flash(x + star.x, y + star.y, 0xffe27a, 90, 320)
      })
    })
  }
}
