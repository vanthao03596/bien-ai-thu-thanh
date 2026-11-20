import '@fontsource/vt323/latin-400.css'
import '@fontsource/vt323/latin-ext-400.css'
import '@fontsource/vt323/vietnamese-400.css'
import { loadImages } from './assets'
import { Game } from './game'
import { FONT_FAMILY } from './gfx'

async function boot(): Promise<void> {
  const canvas = document.getElementById('game')
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing <canvas id="game">')

  // the font must be ready before the first frame, otherwise canvas text falls back to monospace
  const fonts = Promise.all([
    document.fonts.load(`16px ${FONT_FAMILY}`, 'Biên Ải'),
    document.fonts.load(`16px ${FONT_FAMILY}`, 'Thủ Thành ế ợ ư'),
  ]).catch(() => undefined)
  await Promise.all([loadImages(), fonts])

  const game = new Game(canvas)
  game.start()
  if (import.meta.env.DEV) (window as unknown as { __game?: Game }).__game = game
  canvas.focus()
}

boot().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  const pre = document.createElement('pre')
  pre.style.cssText = 'color:#f6efd8;font:14px monospace;padding:24px'
  pre.textContent = `Không tải được game: ${message}`
  document.body.replaceChildren(pre)
})
