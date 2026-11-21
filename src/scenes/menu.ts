import Phaser from 'phaser'
import {
  MAX_STARS, SCENE, bestStars, buyUpgrade, challengeWon, currentMode, cycleDifficulty, cycleMode, earnedStars, endlessBest, fadeIn, freeStars,
  hasProgress, isSwitching, modeUnlocked, refundUpgrades, resetProgress, save, sfx, startLevel, toggleMute,
  type MenuInit,
} from '../app'
import { DIFFICULTY } from '../data/difficulty'
import { LEVELS, VIEW_W } from '../data/levels'
import { CHALLENGE_UPGRADE_TIER, MODE_INFO, isChallenge, resolveLevel, type ModeId } from '../data/modes'
import { TOWERS } from '../data/towers'
import { BRANCH_IDS, TREE_COST, UPGRADES, UPGRADE_TIERS, type BranchId } from '../data/upgrades'
import { frameCamera, onPixelScale, pixelScale, touchFirst } from '../display'
import { BossBar } from '../ui/panels'
import { GOLD, PARCHMENT_DIM, PARCHMENT_INK, label, wrapText } from '../ui/text'
import { Cursor, HitBox, ICONS, RectButton, icon, overClickable, panel, setFrame, veil } from '../ui/widgets'
import type { BattleScene } from './battle'

type Screen = MenuInit['screen']

const CARD_W = 216
const CARD_H = 214
const CARD_GAP = 24
const CARD_Y = 100
/** y of the row of buttons at the bottom of the level and star tree screens */
const FOOT_Y = 362
/** milliseconds the reset button waits for its confirming second press */
const RESET_CONFIRM_MS = 3000

interface Card {
  root: Phaser.GameObjects.Container
  hit: HitBox
  /** playable in the chosen mode */
  open: boolean
  index: number
  /** waves and lives of the chosen mode */
  info: Phaser.GameObjects.Text
  /** what the mode locks, the endless record, or what opens the card */
  extra: Phaser.GameObjects.Text
  /** up to three star slots; a challenge shows one, endless none */
  stars: Phaser.GameObjects.Image[]
  lock: Phaser.GameObjects.Image
  shade: Phaser.GameObjects.Rectangle
}

const TREE_W = 178
const TREE_GAP = 10
const TREE_Y = 100

/** One step of the star tree on screen. */
interface TreeNode {
  branch: BranchId
  tier: number
  id: string
  button: RectButton
  mark: Phaser.GameObjects.Image
}

/** Title screen, level select and star tree, drawn over a battle the bot is playing. */
export class MenuScene extends Phaser.Scene {
  private screen: Screen = 'title'
  private cursor!: Cursor
  private bossBar!: BossBar
  private dimmer!: Phaser.GameObjects.Rectangle
  private title!: Phaser.GameObjects.Container
  private levels!: Phaser.GameObjects.Container
  private upgrades!: Phaser.GameObjects.Container
  private soundButton!: RectButton
  private cards: Card[] = []
  private difficultyButton!: RectButton
  private difficultyBlurb!: Phaser.GameObjects.Text
  private modeButton!: RectButton
  private modeBlurb!: Phaser.GameObjects.Text
  private starTotal!: Phaser.GameObjects.Text
  private treeButton!: RectButton
  private treeNodes: TreeNode[] = []
  private treeStars!: Phaser.GameObjects.Text
  private treeLines: Phaser.GameObjects.Text[] = []
  /** the step a touch player has tapped once: it shows what it does and waits for the buying tap */
  private armedNode: string | null = null
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
    this.treeNodes = []
    this.treeLines = []
    this.armedNode = null
    this.resetButton = null
    this.resetArmedUntil = 0
    onPixelScale(this, () => frameCamera(this.cameras.main, pixelScale(this)))
    this.input.setPollAlways()

    this.bossBar = new BossBar(this, 0)
    this.dimmer = veil(this, this.screen === 'title' ? 0.45 : this.screen === 'levels' ? 0.55 : 0.7)
    this.title = this.createTitle()
    this.levels = this.createLevels()
    this.upgrades = this.createUpgrades()
    this.title.setVisible(this.screen === 'title')
    this.levels.setVisible(this.screen === 'levels')
    this.upgrades.setVisible(this.screen === 'upgrades')
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
      } else if (key === 'escape' && this.screen !== 'title') {
        this.show(this.screen === 'upgrades' ? 'levels' : 'title')
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
    root.add(label(this, VIEW_W / 2, 18, 'Chọn màn chơi', { size: 48, align: 'center', color: GOLD }))
    this.difficultyButton = new RectButton(this, VIEW_W / 2 - 145, 72, 140, '', 'green', () => this.pressDifficulty(), root)
    this.modeButton = new RectButton(this, VIEW_W / 2 + 5, 72, 140, '', 'green', () => this.pressMode(), root)
    this.difficultyBlurb = label(this, VIEW_W / 2, 320, '', { align: 'center', alpha: 0.9 })
    this.modeBlurb = label(this, VIEW_W / 2, 336, '', { align: 'center', alpha: 0.9 })
    root.add([this.difficultyBlurb, this.modeBlurb])
    const left = (VIEW_W - (CARD_W * LEVELS.length + CARD_GAP * (LEVELS.length - 1))) / 2
    const right = left + CARD_W * LEVELS.length + CARD_GAP * (LEVELS.length - 1)
    LEVELS.forEach((level, i) => {
      const card = this.add.container(left + i * (CARD_W + CARD_GAP), CARD_Y)
      root.add(card)
      panel(this, 'panel_parchment', 0, 0, CARD_W, CARD_H, card)
      const plain = { align: 'center', outline: null } as const
      card.add(label(this, CARD_W / 2, 12, `Màn ${i + 1}`, { ...plain, color: PARCHMENT_DIM }))
      card.add(label(this, CARD_W / 2, 28, level.name, { ...plain, size: 32, color: PARCHMENT_INK }))
      wrapText(level.blurb, CARD_W - 28).forEach((line, k) => {
        card.add(label(this, CARD_W / 2, 68 + k * 15, line, { ...plain, color: PARCHMENT_INK }))
      })
      const info = label(this, CARD_W / 2, 132, '', { ...plain, color: PARCHMENT_DIM })
      const extra = label(this, CARD_W / 2, 190, '', { ...plain, color: PARCHMENT_DIM })
      card.add([info, extra])
      const stars: Phaser.GameObjects.Image[] = []
      for (let k = 0; k < 3; k++) {
        const star = this.add.image(0, 152, ICONS, 'star_empty').setOrigin(0, 0).setScale(2)
        card.add(star)
        stars.push(star)
      }
      const lock = this.add.image(CARD_W / 2 - 16, 152, ICONS, 'lock').setOrigin(0, 0).setScale(2)
      const shade = this.add.rectangle(2, 2, CARD_W - 4, CARD_H - 4, 0x1d1322, 0.35).setOrigin(0, 0)
      card.add([lock, shade])
      const hit = new HitBox(this, 0, 0, CARD_W, CARD_H, { onClick: () => this.pressCard(i) }, card)
      this.cards.push({ root: card, hit, open: false, index: i, info, extra, stars, lock, shade })
    })
    this.starTotal = label(this, left, FOOT_Y + 2, '')
    root.add(this.starTotal)
    this.treeButton = new RectButton(this, VIEW_W / 2 - 176, FOOT_Y, 120, '', 'green', () => this.show('upgrades'), root)
    new RectButton(this, VIEW_W / 2 - 50, FOOT_Y, 100, 'Quay lại', 'red', () => this.show('title'), root)
    if (hasProgress()) {
      this.resetButton = new RectButton(this, right - 120, FOOT_Y, 120, 'Xóa tiến độ', 'red', () => this.pressReset(), root)
    }
    this.showCards()
    return root
  }

  // ------------------------------------------------------------ star tree

  private createUpgrades(): Phaser.GameObjects.Container {
    const root = this.add.container(0, 0)
    root.add(label(this, VIEW_W / 2, 18, 'Cây sao', { size: 48, align: 'center', color: GOLD }))
    this.treeStars = label(this, VIEW_W / 2, 74, '', { align: 'center' })
    root.add(this.treeStars)
    const left = (VIEW_W - (TREE_W * BRANCH_IDS.length + TREE_GAP * (BRANCH_IDS.length - 1))) / 2
    BRANCH_IDS.forEach((branch, i) => {
      const def = UPGRADES[branch]
      const box = this.add.container(left + i * (TREE_W + TREE_GAP), TREE_Y)
      root.add(box)
      panel(this, 'panel_parchment', 0, 0, TREE_W, 40 + UPGRADE_TIERS * 28, box)
      icon(this, def.icon, 12, 10, box)
      box.add(label(this, 34, 10, def.name, { color: PARCHMENT_INK, outline: null }))
      def.nodes.forEach((node, tier) => {
        const y = 36 + tier * 28
        const id = `${branch}:${tier}`
        const mark = icon(this, 'lock', 12, y + 2, box)
        const button = new RectButton(this, 34, y, TREE_W - 46, node.name, 'green', () => this.pressNode(branch, tier, id), box)
        this.treeNodes.push({ branch, tier, id, button, mark })
      })
    })
    for (let k = 0; k < 3; k++) {
      const line = label(this, VIEW_W / 2, 250 + k * 16, '', { align: 'center', color: k === 0 ? GOLD : undefined })
      root.add(line)
      this.treeLines.push(line)
    }
    const names = `${MODE_INFO.laststand.name} và ${MODE_INFO.siege.name}`
    root.add(label(this, VIEW_W / 2, 320, `Trong ${names} chỉ ${CHALLENGE_UPGRADE_TIER} bậc đầu của mỗi nhánh có hiệu lực.`, { align: 'center', alpha: 0.9 }))
    root.add(label(this, VIEW_W / 2, 336, `Mỗi màn cho tối đa 3 sao chiến dịch và 1 sao cho mỗi thử thách. Cả cây tốn ${TREE_COST} sao.`, { align: 'center', alpha: 0.9 }))
    new RectButton(this, VIEW_W / 2 - 130, FOOT_Y, 120, 'Hoàn sao', 'red', () => this.pressRefund(), root)
    new RectButton(this, VIEW_W / 2 + 10, FOOT_Y, 120, 'Quay lại', 'green', () => this.show('levels'), root)
    this.showTree()
    return root
  }

  /** Buys a step of the tree; on touch screens the first tap only shows what it does. */
  private pressNode(branch: BranchId, tier: number, id: string): void {
    if (this.input.activePointer.wasTouch && this.armedNode !== id) {
      this.armedNode = id
      return
    }
    this.armedNode = null
    if (tier !== save.upgrades[branch] || !buyUpgrade(branch)) {
      sfx.play('deny')
      return
    }
    sfx.play('upgrade')
    this.showTree()
    this.showCards()
  }

  private pressRefund(): void {
    this.armedNode = null
    refundUpgrades()
    this.showTree()
    this.showCards()
  }

  /** Marks every step as owned, next in line or still closed. */
  private showTree(): void {
    this.treeStars.setText(`Sao còn lại: ${freeStars()}     Đã gom: ${earnedStars()}/${MAX_STARS}`)
    for (const node of this.treeNodes) {
      const owned = save.upgrades[node.branch]
      setFrame(node.mark, node.tier < owned ? 'check' : node.tier === owned ? 'star' : 'lock')
      node.button.root.setAlpha(node.tier <= owned ? 1 : 0.6)
    }
  }

  /** What the step under the pointer (or the one a touch player tapped) does, and what a click on it would do. */
  private describeNode(): void {
    const touch = this.input.activePointer.wasTouch
    const node = this.treeNodes.find((n) => n.button.hit.hover) ?? this.treeNodes.find((n) => n.id === this.armedNode)
    let lines: string[]
    if (!node) {
      lines = ['', touch ? 'Chạm vào một nâng cấp để xem tác dụng.' : 'Rê chuột lên một nâng cấp để xem tác dụng.', '']
    } else {
      const def = UPGRADES[node.branch].nodes[node.tier]
      const owned = save.upgrades[node.branch]
      const state =
        node.tier < owned ? 'Đã có.'
        : node.tier > owned ? 'Cần mua bậc trước của nhánh này.'
        : def.cost > freeStars() ? 'Chưa đủ sao.'
        : touch ? 'Chạm lần nữa để mua.'
        : 'Bấm để mua.'
      lines = [`${UPGRADES[node.branch].name} bậc ${node.tier + 1}: ${def.name}  -  ${def.cost} sao`, def.text, state]
    }
    this.treeLines.forEach((line, k) => {
      if (line.text !== lines[k]) line.setText(lines[k])
    })
  }

  /** The level cards slide up into place one after another. */
  private dealCards(): void {
    this.cards.forEach((card, i) => {
      this.tweens.killTweensOf(card.root)
      card.root.setY(CARD_Y + 26).setAlpha(0)
      this.tweens.add({ targets: card.root, y: CARD_Y, alpha: 1, delay: 60 + i * 70, duration: 260, ease: 'Back.easeOut' })
    })
  }

  /** Starts the level of a card in the chosen mode, if that is open. */
  private pressCard(index: number): void {
    if (!this.cards[index].open) {
      sfx.play('deny')
      return
    }
    sfx.play('click')
    startLevel(this, index, currentMode())
  }

  private pressDifficulty(): void {
    cycleDifficulty()
    this.showCards()
  }

  private pressMode(): void {
    cycleMode()
    this.showCards()
  }

  /** One line under the name of a level: what the chosen mode asks for there. */
  private modeLine(index: number, mode: ModeId): string {
    const level = resolveLevel(LEVELS[index], mode)
    const lives = `${level.lives} mạng`
    switch (mode) {
      case 'campaign':
        return `${level.waves.length} đợt quái  -  ${lives}`
      case 'laststand':
        return `${level.waves.length} đợt quái dữ  -  ${lives}`
      case 'siege':
        return `Một đợt rất dài  -  ${lives}`
      case 'endless':
        return `Không có đợt cuối  -  ${lives}`
    }
  }

  /** The small print at the bottom of a card. */
  private extraLine(index: number, mode: ModeId, open: boolean): string {
    const level = LEVELS[index]
    if (!open) return mode === 'campaign' ? 'Thắng màn trước để mở' : 'Thắng chiến dịch màn này để mở'
    if (mode === 'endless') {
      const best = endlessBest(level.id)
      return best ? `Kỷ lục: đợt ${best.wave}, ${best.score} điểm` : 'Chưa có kỷ lục'
    }
    if (isChallenge(mode)) {
      const locked = level.modes[mode].lockedTowers
      if (locked.length > 0) return `Khóa: ${locked.map((t) => TOWERS[t].name).join(', ')}`
    }
    return ''
  }

  /**
   * Fills the cards for the chosen difficulty and mode. Stars and records are
   * kept apart for every difficulty: the cards show those of the chosen one.
   */
  private showCards(): void {
    const mode = currentMode()
    const difficulty = DIFFICULTY[save.difficulty]
    this.difficultyButton.setText(`Độ khó: ${difficulty.name}`)
    this.difficultyBlurb.setText(difficulty.blurb)
    this.modeButton.setText(`Chế độ: ${MODE_INFO[mode].name}`)
    this.modeBlurb.setText(MODE_INFO[mode].blurb)
    this.starTotal.setText(`Sao: ${earnedStars()}/${MAX_STARS}`)
    this.treeButton.setText(`Cây sao (${freeStars()})`)
    const slots = mode === 'campaign' ? 3 : isChallenge(mode) ? 1 : 0
    for (const card of this.cards) {
      const level = LEVELS[card.index]
      const open = modeUnlocked(card.index, mode)
      card.open = open
      card.lock.setVisible(!open)
      card.shade.setVisible(!open)
      card.info.setText(this.modeLine(card.index, mode))
      card.extra.setText(this.extraLine(card.index, mode, open))
      const earned = mode === 'campaign' ? bestStars(level.id) : isChallenge(mode) && challengeWon(level.id, mode) ? 1 : 0
      const first = (CARD_W - (32 + (slots - 1) * 36)) / 2
      card.stars.forEach((star, k) => {
        star.setVisible(open && k < slots).setX(first + k * 36)
        setFrame(star, k < earned ? 'star' : 'star_empty')
      })
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
    this.armedNode = null
    this.title.setVisible(screen === 'title')
    this.levels.setVisible(screen === 'levels')
    this.upgrades.setVisible(screen === 'upgrades')
    this.tweens.add({ targets: this.dimmer, fillAlpha: screen === 'title' ? 0.45 : screen === 'levels' ? 0.55 : 0.7, duration: 200 })
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
    } else if (this.screen === 'upgrades') {
      this.describeNode()
    }
    const battle = this.scene.get(SCENE.battle) as BattleScene
    if (battle.world) this.bossBar.update(battle.world)
    this.cursor.update(overClickable(this))
  }
}
