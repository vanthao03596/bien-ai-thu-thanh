import Phaser from 'phaser'
import { MAX_STARS, earnedStars, endlessBest, save, showMenu, startLevel, toggleMute } from '../app'
import { frameNameAt } from '../assets'
import { DIFFICULTY } from '../data/difficulty'
import type { EnemyDef } from '../data/enemies'
import { LEVELS, VIEW_H, VIEW_W } from '../data/levels'
import { MODE_INFO } from '../data/modes'
import { NOTICE_LIFE, type Notice } from '../notices'
import type { Session } from '../session'
import { BattleStats, creditName } from '../sim/stats'
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

const CARD_LINE = 14
/** the enemy portrait stands in a column this wide, and no taller */
const PORTRAIT = 34

/**
 * A card under the buttons at the top right: an enemy the player meets for the
 * first time, with what beats it, or the advice a wave carries. A click takes
 * it down; left alone it leaves by itself.
 */
export class NoticeCard {
  static readonly W = 204

  private readonly root: Phaser.GameObjects.Container
  private readonly box: Phaser.GameObjects.NineSlice
  private readonly portrait: Phaser.GameObjects.Image
  private readonly lines: Phaser.GameObjects.Text[] = []
  private readonly hit: HitBox
  private readonly lineDy: number
  private shown: Notice | null = null
  private sheet = ''
  private anim = ''

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
    onDismiss: () => void,
  ) {
    this.root = scene.add.container(VIEW_W - 4 - NoticeCard.W, 42).setDepth(depth).setVisible(false)
    this.box = panel(scene, 'panel_stone', 0, 0, NoticeCard.W, 40, this.root)
    this.portrait = scene.add.image(0, 0, HUD, 'cursor_point').setVisible(false)
    this.root.add(this.portrait)
    this.hit = new HitBox(scene, 0, 0, NoticeCard.W, 40, { onClick: onDismiss }, this.root)
    const probe = label(scene, 0, 0, '')
    this.lineDy = probe.y
    probe.destroy()
  }

  /** The pointer is over the card. */
  get hover(): boolean {
    return this.hit.hover
  }

  /** def is the enemy of an enemy card, with the stats of the battle. age and clock are in seconds. */
  update(notice: Notice | null, def: EnemyDef | null, age: number, clock: number): void {
    if (!notice) {
      if (this.shown) {
        this.shown = null
        this.root.setVisible(false)
        this.hit.reset()
      }
      return
    }
    if (notice !== this.shown) {
      this.shown = notice
      this.root.setVisible(true)
      this.layout(notice, def)
    }
    this.root.setAlpha(Math.min(1, age * 5, (NOTICE_LIFE - age) * 2))
    if (this.portrait.visible) setFrame(this.portrait, frameNameAt(this.sheet, this.anim, clock))
  }

  private layout(notice: Notice, def: EnemyDef | null): void {
    const texts: { text: string; color: string; x: number }[] = []
    const add = (text: string, color: string, x: number): void => {
      for (const part of wrapText(text, NoticeCard.W - x - 8)) texts.push({ text: part, color, x })
    }
    const enemy = notice.kind === 'enemy' ? def : null
    this.portrait.setVisible(enemy !== null)
    if (enemy) {
      const beside = PORTRAIT + 8
      add('Quái mới', CREAM, beside)
      add(enemy.name, GOLD, beside)
      const stats = [`Máu ${enemy.hp}`]
      if (enemy.armor > 0) stats.push(`Giáp ${Math.round(enemy.armor * 100)}%`)
      if (enemy.magicRes > 0) stats.push(`Kháng phép ${Math.round(enemy.magicRes * 100)}%`)
      if (enemy.flying) stats.push('Bay')
      add(stats.join('  '), CREAM, 8)
      add(enemy.intro, CREAM, 8)
      this.sheet = enemy.sheet
      this.anim = enemy.flying ? 'fly' : 'walk_side'
      // the sprites keep their feet on the pivot: big ones are shrunk to fit the column
      const scale = Math.min(enemy.scale ?? 1, (PORTRAIT - 8) / enemy.height)
      this.portrait
        .setTexture(enemy.sheet, frameNameAt(enemy.sheet, this.anim, 0))
        .setScale(scale)
        .setTint(enemy.tint ?? 0xffffff)
        .setAlpha(enemy.alpha ?? 1)
        .setPosition(6 + PORTRAIT / 2, PORTRAIT - (enemy.flying ? 6 : 2))
    } else if (notice.kind === 'tip') {
      add('Lời khuyên', GOLD, 8)
      add(notice.text, CREAM, 8)
    }
    const height = 10 + texts.length * CARD_LINE
    resizePanel(this.box, NoticeCard.W, height)
    this.hit.zone.setSize(NoticeCard.W, height)
    texts.forEach((line, i) => {
      let t = this.lines[i]
      if (!t) {
        t = label(this.scene, 0, 0, '')
        this.root.add(t)
        this.lines[i] = t
      }
      t.setText(line.text).setColor(line.color).setVisible(true)
      // label() shifts left-aligned text by half its outline; the shift has to follow the line
      t.setPosition(line.x - t.style.strokeThickness / 2, 5 + i * CARD_LINE + this.lineDy)
    })
    for (let i = texts.length; i < this.lines.length; i++) this.lines[i].setVisible(false)
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
    new RectButton(scene, bx, 80, 140, 'Chơi lại', 'green', () => {
      session.leave()
      startLevel(scene, session.levelIndex, session.mode)
    }, this.box)
    this.sound = new RectButton(scene, bx, 106, 140, soundLabel(), 'green', () => toggleMute(scene.game), this.box)
    new RectButton(scene, bx, 132, 140, 'Về menu', 'red', () => {
      session.leave()
      showMenu(scene, 'levels')
    }, this.box)
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

interface ResultLine {
  text: string
  color?: string
}

/** The end of a battle: fades the field, slides the parchment in and pops the stars one by one. */
export class ResultPanel {
  private shown = false

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly session: Session,
    private readonly fx: Fx,
    private readonly depth: number,
    /** the battle set a new endless record */
    private readonly isRecord: () => boolean,
  ) {}

  update(): void {
    const s = this.session
    if (this.shown || s.world.result === null || s.resultT <= 1.2) return
    this.shown = true
    this.build(s.world)
  }

  /** What the sheet says under the title (and the stars, if any), top to bottom. */
  private lines(w: World, finale: boolean): ResultLine[] {
    const s = this.session
    const gold = '#a8721a'
    const lines: ResultLine[] = []
    const difficulty = `Độ khó: ${DIFFICULTY[w.difficulty].name}`
    if (w.endless) {
      lines.push({ text: `Trụ đến đợt ${w.waveIndex + 1}  -  ${w.score} điểm` })
      lines.push({ text: difficulty })
      const best = endlessBest(w.level.id, w.difficulty)
      if (this.isRecord()) lines.push({ text: 'Kỷ lục mới!', color: gold })
      else if (best) lines.push({ text: `Kỷ lục: đợt ${best.wave}, ${best.score} điểm` })
      lines.push({ text: `Đã hạ ${w.kills} quái.` })
    } else if (w.result === 'win') {
      if (s.mode === 'campaign') lines.push({ text: `Mạng còn lại: ${w.lives}/${w.level.lives}  -  ${difficulty}` })
      else lines.push({ text: `${MODE_INFO[s.mode].name}  -  ${difficulty}` })
      if (finale) {
        // the win of this battle is already in the save when the sheet is built
        const total = earnedStars()
        lines.push({ text: 'Quỷ vương đã bại. Biên ải yên bình trở lại.' })
        lines.push({ text: `Sao đã gom: ${total}/${MAX_STARS}`, color: gold })
        if (total < MAX_STARS) lines.push({ text: 'Thử Tử thủ, Vây hãm và Vô tận trên các màn đã thắng.' })
      }
    } else {
      lines.push({ text: `Thành thất thủ ở đợt ${w.waveIndex + 1}/${w.waveCount}.` })
      lines.push({ text: `Đã hạ ${w.kills} quái.` })
    }
    const killer = BattleStats.top(s.stats.kills)
    const hitter = BattleStats.top(s.stats.damage)
    if (killer) lines.push({ text: `Hạ nhiều nhất: ${creditName(killer)} (${s.stats.kills[killer]} quái)` })
    if (hitter) lines.push({ text: `Sát thương cao nhất: ${creditName(hitter)} (${Math.round(s.stats.damage[hitter])})` })
    return lines
  }

  private build(w: World): void {
    const scene = this.scene
    const s = this.session
    const win = w.result === 'win'
    const campaign = s.mode === 'campaign'
    // winning the last level ends the campaign: a wider sheet with the closing words
    const finale = win && campaign && s.levelIndex === LEVELS.length - 1
    const lines = this.lines(w, finale)
    const starSlots = !win ? 0 : campaign ? 3 : 1
    const linesY = starSlots > 0 ? 120 : 84
    const pw = finale || w.endless ? 300 : 260
    const ph = linesY + lines.length * 16 + 12 + 34
    const x = (VIEW_W - pw) / 2
    const y = Math.round((VIEW_H - ph) / 2)
    const { root, dimmer } = modal(scene, this.depth, 0.6)
    root.setVisible(true)
    dimmer.setAlpha(0)
    scene.tweens.add({ targets: dimmer, alpha: 1, duration: 400 })

    const box = scene.add.container(x, y + 30).setAlpha(0)
    root.add(box)
    panel(scene, 'panel_parchment', 0, 0, pw, ph, box)
    box.add(
      label(scene, pw / 2, 22, finale ? 'TOÀN THẮNG' : win ? 'CHIẾN THẮNG' : w.endless ? 'HẾT TRẬN' : 'THẤT THỦ', {
        size: 48, align: 'center', color: win ? '#a8721a' : '#861c2a', outline: null,
      }),
    )
    const stars: Phaser.GameObjects.Image[] = []
    for (let i = 0; i < starSlots; i++) {
      // origin in the middle so the pop grows from the centre of the star
      const star = scene.add.image(pw / 2 + (i - (starSlots - 1) / 2) * 44, 94, ICONS, 'star_empty').setScale(2)
      box.add(star)
      stars.push(star)
    }
    lines.forEach((line, i) => {
      box.add(label(scene, pw / 2, linesY + i * 16, line.text, { align: 'center', color: line.color ?? PARCHMENT_INK, outline: null }))
    })

    const by = ph - 34
    const retry = (): void => startLevel(scene, s.levelIndex, s.mode)
    const menu = (): void => showMenu(scene, 'levels')
    if (win && campaign && s.levelIndex < LEVELS.length - 1) {
      new RectButton(scene, pw / 2 - 116, by, 74, 'Màn kế', 'green', () => startLevel(scene, s.levelIndex + 1, s.mode), box)
      new RectButton(scene, pw / 2 - 37, by, 74, 'Chơi lại', 'green', retry, box)
      new RectButton(scene, pw / 2 + 42, by, 74, 'Menu', 'red', menu, box)
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
