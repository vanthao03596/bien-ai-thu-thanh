import Phaser from 'phaser'
import { SCENE, initAudio, type BattleInit, type MenuInit } from '../app'
import { anim, assetFiles, digits, sheet, sheetKeys } from '../assets'
import { VIEW_H, VIEW_W } from '../data/levels'
import { frameCamera, onPixelScale, pixelScale } from '../display'
import { DIGIT_FONT, label } from '../ui/text'
import { animKey } from '../view/battle-view'
import { createFxTextures } from '../view/fx'

/** Loads the pixel pack with a progress bar, then registers animations and fonts. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE.boot)
  }

  preload(): void {
    onPixelScale(this, () => frameCamera(this.cameras.main, pixelScale(this)))

    const w = 220
    const x = (VIEW_W - w) / 2
    const y = VIEW_H / 2 + 6
    label(this, VIEW_W / 2, y - 30, 'Đang tải...', { align: 'center' })
    this.add.rectangle(x - 2, y - 2, w + 4, 12, 0x3b2414).setOrigin(0, 0)
    this.add.rectangle(x - 1, y - 1, w + 2, 10, 0x1d1322).setOrigin(0, 0)
    const bar = this.add.rectangle(x, y, 1, 8, 0xffe27a).setOrigin(0, 0)
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
      bar.width = Math.max(1, Math.round(w * p))
    })

    for (const file of assetFiles()) {
      if (file.atlas) this.load.atlas(file.key, file.url, file.atlas)
      else this.load.image(file.key, file.url)
    }
  }

  create(): void {
    // every animation row of every sheet, keyed as "<sheet>:<animation>"
    for (const key of sheetKeys()) {
      for (const name of Object.keys(sheet(key).anims)) {
        const a = anim(key, name)
        this.anims.create({
          key: animKey(key, name),
          frames: a.names.map((frame) => ({ key, frame })),
          frameRate: a.fps,
          repeat: a.loop ? -1 : 0,
        })
      }
    }

    const font = digits()
    this.cache.bitmapFont.add(
      DIGIT_FONT,
      Phaser.GameObjects.RetroFont.Parse(this, {
        image: font.key,
        width: font.glyphW,
        height: font.glyphH,
        chars: font.chars,
        charsPerRow: font.chars.length,
        'offset.x': 0,
        'offset.y': 0,
        'spacing.x': 0,
        'spacing.y': 0,
        lineSpacing: 0,
      }),
    )

    createFxTextures(this)
    initAudio(this.game)

    const battle: BattleInit = { levelIndex: 0, demo: true }
    const menu: MenuInit = { screen: 'title' }
    this.scene.launch(SCENE.battle, battle)
    this.scene.launch(SCENE.menu, menu)
    this.scene.stop()
  }
}
