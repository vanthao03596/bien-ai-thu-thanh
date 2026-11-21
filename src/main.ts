import '@fontsource/vt323/latin-400.css'
import '@fontsource/vt323/latin-ext-400.css'
import '@fontsource/vt323/vietnamese-400.css'
import Phaser from 'phaser'
import { VIEW_H, VIEW_W } from './data/levels'
import { watchPixelScale, windowPixelScale } from './display'
import { BattleScene } from './scenes/battle'
import { BootScene } from './scenes/boot'
import { HudScene } from './scenes/hud'
import { MenuScene } from './scenes/menu'
import { FONT_FAMILY, refreshLabels } from './ui/text'

async function boot(): Promise<void> {
  // the font must be ready before the first label is rasterised, otherwise it falls back to monospace
  await Promise.all([
    document.fonts.load(`16px ${FONT_FAMILY}`, 'Biên Ải'),
    document.fonts.load(`16px ${FONT_FAMILY}`, 'Thủ Thành ế ợ ư'),
  ]).catch(() => undefined)

  const scale = windowPixelScale()
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'app',
    width: VIEW_W * scale,
    height: VIEW_H * scale,
    backgroundColor: '#1d1322',
    title: 'Biên Ải - Thủ Thành Pixel',
    // nearest-neighbour textures and no multisampling; positions are snapped by the game itself
    pixelArt: true,
    disableContextMenu: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // render order: the battlefield, then whichever of the two overlays is running
    scene: [BootScene, BattleScene, MenuScene, HudScene],
  })
  watchPixelScale(game)
  game.scale.on(Phaser.Scale.Events.RESIZE, () => refreshLabels(Math.round(game.scale.width / VIEW_W)))
  if (import.meta.env.DEV) (window as unknown as { __game?: Phaser.Game }).__game = game
}

boot().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  const pre = document.createElement('pre')
  pre.style.cssText = 'color:#f6efd8;font:14px monospace;padding:24px'
  pre.textContent = `Không tải được game: ${message}`
  document.body.replaceChildren(pre)
})
