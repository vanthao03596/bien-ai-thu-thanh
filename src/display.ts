import Phaser from 'phaser'
import { VIEW_H, VIEW_W } from './data/levels'

// The game is laid out in logical pixels (768x432). The canvas backing store is an
// integer multiple of that, and every camera zooms by the same integer, so the pixel
// art stays crisp at any window size while text is rasterised at full resolution.

/** Backing-store pixels per logical pixel for a given window. */
export function pixelScaleFor(width: number, height: number, dpr: number): number {
  const css = Math.min(Math.max(160, width) / VIEW_W, Math.max(90, height) / VIEW_H)
  return Math.max(1, Math.min(6, Math.ceil(css * dpr - 0.01)))
}

export function windowPixelScale(): number {
  return pixelScaleFor(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1)
}

/** The integer scale the game currently runs at. */
export function pixelScale(scene: Phaser.Scene): number {
  return Math.max(1, Math.round(scene.scale.width / VIEW_W))
}

/** Keeps the backing store matched to the window; scenes react through the scale manager's resize event. */
export function watchPixelScale(game: Phaser.Game): void {
  const apply = (): void => {
    const s = windowPixelScale()
    if (game.scale.width !== VIEW_W * s) game.scale.setGameSize(VIEW_W * s, VIEW_H * s)
  }
  window.addEventListener('resize', apply)
  window.visualViewport?.addEventListener('resize', apply)
}

/** Points a camera so the logical point (left, top) sits in its top-left corner at the given zoom. */
export function frameCamera(cam: Phaser.Cameras.Scene2D.Camera, zoom: number, left = 0, top = 0): void {
  cam.setZoom(zoom)
  cam.centerOn(left + cam.width / zoom / 2, top + cam.height / zoom / 2)
}

/** Runs layout now and again whenever the pixel scale changes, until the scene shuts down. */
export function onPixelScale(scene: Phaser.Scene, layout: () => void): void {
  scene.scale.on(Phaser.Scale.Events.RESIZE, layout)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, layout))
  layout()
}
