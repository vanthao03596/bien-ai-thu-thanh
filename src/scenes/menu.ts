import Phaser from 'phaser'
import {
  MAX_STARS, SCENE, bestStars, cycleDifficulty, fadeIn, hasProgress, isSwitching, levelUnlocked, resetProgress, save, sfx, startLevel,
  toggleMute, totalStars,
  type MenuInit,
} from '../app'
import { DIFFICULTY } from '../data/difficulty'
import { LEVELS, VIEW_W } from '../data/levels'
import { frameCamera, onPixelScale, pixelScale, touchFirst } from '../display'
import { BossBar } from '../ui/panels'
import { GOLD, PARCHMENT_DIM, PARCHMENT_INK, label, wrapText } from '../ui/text'
import { Cursor, HitBox, ICONS, RectButton, overClickable, panel, setFrame, veil } from '../ui/widgets'
import type { BattleScene } from './battle'

type Screen = MenuInit['screen']

const CARD_W = 216
const CARD_H = 214
const CARD_GAP = 24
const CARD_Y = 104
/** milliseconds the reset button waits for its confirming second press */
const RESET_CONFIRM_MS = 3000

interface Card {
  root: Phaser.GameObjects.Container
  hit: HitBox
  open: boolean
  levelId: string
  /** the three star slots of an open card */
  stars: Phaser.GameObjects.Image[]
}

/** Title screen and level select, drawn over a battle the bot is playing. */
export class MenuScene extends Phaser.Scene {
  private screen: Screen = 'title'
  private cursor!: Cursor
  private bossBar!: BossBar
  private dimmer!: Phaser.GameObjects.Rectangle
  private title!: Phaser.GameObjects.Container
  private levels!: Phaser.GameObjects.Container
  private soundButton!: RectButton
  private cards: Card[] = []
  private difficultyButton!: RectButton
  private difficultyBlurb!: Phaser.GameObjects.Text
  private starTotal!: Phaser.GameObjects.Text
  private resetButton: RectButton | null = null
  private resetArmedUntil = 0

  constructor() {
    super(SCENE.menu)
  }

  init(data: Partial<MenuInit>): void {
    this.screen = data.screen ?? 'title'
  }

  create(): void {
    this.cards = []
    this.resetButton = null
    this.resetArmedUntil = 0
    onPixelScale(this, () => frameCamera(this.cameras.main, pixelScale(this)))
    this.input.setPollAlways()

    this.bossBar = new BossBar(this, 0)
    this.dimmer = veil(this, this.screen === 'title' ? 0.45 : 0.55)
    this.title = this.createTitle()
    this.levels = this.createLevels()
    this.title.setVisible(this.screen === 'title')
    this.levels.setVisible(this.screen === 'levels')
    if (this.screen === 'levels') this.dealCards()
    this.cursor = new Cursor(this)

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (ev.repeat || isSwitching()) return
      const key = ev.key.toLowerCase()
      if (key === 'm') {
        toggleMute(this.game)
      } else if ((key === 'enter' || key === ' ') && this.screen === 'title') {
        ev.preventDefault()
        this.show('levels')
      } else if (key === 'escape' && this.screen === 'levels') {
        this.show('title')
      }
    })
    fadeIn(this)
  }

  private createTitle(): Phaser.GameObjects.Container {
    const root = this.add.container(0, 0)
    const name = label(this, VIEW_W / 2, 92, 'BIÊN ẢI', { size: 96, align: 'center', color: GOLD })
    root.add(name)
    // the name bobs up and down in whole pixels
    this.tweens.add({ targets: name, y: name.y + 4, duration: 1570, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
    root.add(label(this, VIEW_W / 2, 186, 'Thủ Thành Pixel', { size: 32, align: 'center' }))
    new RectButton(this, VIEW_W / 2 - 60, 250, 120, 'Bắt đầu', 'green', () => this.show('levels'), root)
    this.soundButton = new RectButton(this, VIEW_W / 2 - 60, 278, 120, '', 'green', () => toggleMute(this.game), root)
    const help = { align: 'center', alpha: 0.9 } as const
    if (touchFirst()) {
      root.add(label(this, VIEW_W / 2, 372, 'Chạm: chọn và xem thông tin   Chạm lần nữa: xác nhận', help))
      root.add(label(this, VIEW_W / 2, 390, 'Hai ngón: phóng to, thu nhỏ   Một ngón kéo: di chuyển bản đồ', help))
    } else {
      root.add(label(this, VIEW_W / 2, 372, 'Chuột trái: chọn và xây   Chuột phải: hủy   Space: tạm dừng   Lăn chuột: phóng to', help))
      root.add(label(this, VIEW_W / 2, 390, 'F: tua nhanh   1, 2: phép   H: chọn tướng   M: tắt tiếng', help))
    }
    return root
  }

  private createLevels(): Phaser.GameObjects.Container {
    const root = this.add.container(0, 0)
    root.add(label(this, VIEW_W / 2, 22, 'Chọn màn chơi', { size: 48, align: 'center', color: GOLD }))
    this.difficultyButton = new RectButton(this, VIEW_W / 2 - 70, 76, 140, '', 'green', () => this.pressDifficulty(), root)
    this.difficultyBlurb = label(this, VIEW_W / 2, 326, '', { align: 'center', alpha: 0.9 })
    root.add(this.difficultyBlurb)
    const left = (VIEW_W - (CARD_W * LEVELS.length + CARD_GAP * (LEVELS.length - 1))) / 2
    LEVELS.forEach((level, i) => {
      const open = levelUnlocked(i)
      const card = this.add.container(left + i * (CARD_W + CARD_GAP), CARD_Y)
      root.add(card)
      panel(this, 'panel_parchment', 0, 0, CARD_W, CARD_H, card)
      const plain = { align: 'center', outline: null } as const
      card.add(label(this, CARD_W / 2, 12, `Màn ${i + 1}`, { ...plain, color: PARCHMENT_DIM }))
      card.add(label(this, CARD_W / 2, 28, level.name, { ...plain, size: 32, color: PARCHMENT_INK }))
      wrapText(level.blurb, CARD_W - 28).forEach((line, k) => {
        card.add(label(this, CARD_W / 2, 68 + k * 15, line, { ...plain, color: PARCHMENT_INK }))
      })
      card.add(label(this, CARD_W / 2, 134, `${level.waves.length} đợt quái`, { ...plain, color: PARCHMENT_DIM }))
      const stars: Phaser.GameObjects.Image[] = []
      if (open) {
        for (let s = 0; s < 3; s++) {
          const star = this.add.image(CARD_W / 2 - 54 + s * 36, 158, ICONS, 'star_empty').setOrigin(0, 0).setScale(2)
          card.add(star)
          stars.push(star)
        }
      } else {
        card.add(this.add.image(CARD_W / 2 - 16, 156, ICONS, 'lock').setOrigin(0, 0).setScale(2))
        card.add(this.add.rectangle(2, 2, CARD_W - 4, CARD_H - 4, 0x1d1322, 0.35).setOrigin(0, 0))
      }
      const hit = new HitBox(
        this, 0, 0, CARD_W, CARD_H,
        {
          onClick: () => {
            if (!open) {
              sfx.play('deny')
              return
            }
            sfx.play('click')
            startLevel(this, i)
          },
        },
        card,
      )
      this.cards.push({ root: card, hit, open, levelId: level.id, stars })
    })
    new RectButton(this, VIEW_W / 2 - 50, 350, 100, 'Quay lại', 'red', () => this.show('title'), root)
    this.starTotal = label(this, left, 352, '')
    root.add(this.starTotal)
    this.showDifficulty()
    if (hasProgress()) {
      this.resetButton = new RectButton(this, left + CARD_W * LEVELS.length + CARD_GAP * (LEVELS.length - 1) - 120, 350, 120, 'Xóa tiến độ', 'red', () => this.pressReset(), root)
    }
    return root
  }

  /** The level cards slide up into place one after another. */
  private dealCards(): void {
    this.cards.forEach((card, i) => {
      this.tweens.killTweensOf(card.root)
      card.root.setY(CARD_Y + 26).setAlpha(0)
      this.tweens.add({ targets: card.root, y: CARD_Y, alpha: 1, delay: 60 + i * 70, duration: 260, ease: 'Back.easeOut' })
    })
  }

  private pressDifficulty(): void {
    cycleDifficulty()
    this.showDifficulty()
  }

  /** Stars are kept apart for every difficulty: the cards show those of the chosen one. */
  private showDifficulty(): void {
    const def = DIFFICULTY[save.difficulty]
    this.difficultyButton.setText(`Độ khó: ${def.name}`)
    this.difficultyBlurb.setText(def.blurb)
    this.starTotal.setText(`Tổng số sao: ${totalStars()}/${MAX_STARS}`)
    for (const card of this.cards) {
      const earned = bestStars(card.levelId)
      card.stars.forEach((star, i) => setFrame(star, i < earned ? 'star' : 'star_empty'))
    }
  }

  /** Wipes the save on the second press; the first one only asks. */
  private pressReset(): void {
    if (this.time.now > this.resetArmedUntil) {
      this.resetArmedUntil = this.time.now + RESET_CONFIRM_MS
      return
    }
    resetProgress()
    const init: MenuInit = { screen: 'levels' }
    this.scene.restart(init)
  }

  private show(screen: Screen): void {
    if (screen === this.screen) return
    this.screen = screen
    this.resetArmedUntil = 0
    this.title.setVisible(screen === 'title')
    this.levels.setVisible(screen === 'levels')
    this.tweens.add({ targets: this.dimmer, fillAlpha: screen === 'title' ? 0.45 : 0.55, duration: 200 })
    if (screen === 'levels') this.dealCards()
  }

  override update(): void {
    this.soundButton.setText(`Âm thanh: ${save.muted ? 'Tắt' : 'Bật'}`)
    this.resetButton?.setText(this.time.now <= this.resetArmedUntil ? 'Xóa thật chứ?' : 'Xóa tiến độ')
    if (this.screen === 'levels') {
      for (const card of this.cards) {
        // an open card lifts slightly under the pointer, once it has settled in place
        if (this.tweens.isTweening(card.root)) continue
        card.root.y = CARD_Y - (card.open && card.hit.hover ? 2 : 0)
      }
    }
    const battle = this.scene.get(SCENE.battle) as BattleScene
    if (battle.world) this.bossBar.update(battle.world)
    this.cursor.update(overClickable(this))
  }
}
