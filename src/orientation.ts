import type Phaser from 'phaser'
import { APP_EVENT } from './app'

/** Matches the CSS rule in index.html that shows the rotate notice. */
const PORTRAIT_PHONE = '(orientation: portrait) and (pointer: coarse)'

/** Goes fullscreen and turns the screen sideways where the browser allows it (Android); elsewhere it rejects. */
async function forceLandscape(): Promise<void> {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
  await screen.orientation.lock('landscape')
}

function canForceLandscape(): boolean {
  // Safari on iPhone has neither fullscreen for pages nor an orientation lock
  return document.fullscreenEnabled === true && typeof screen.orientation?.lock === 'function'
}

/**
 * The game is laid out for a wide screen. A phone held upright gets a notice
 * instead (drawn by index.html); this pauses the battle under it and wires the
 * button that turns the screen without rotating the phone.
 */
export function watchOrientation(game: Phaser.Game): void {
  const query = window.matchMedia(PORTRAIT_PHONE)
  const hold = (): void => {
    if (query.matches) game.events.emit(APP_EVENT.hold)
  }
  query.addEventListener('change', hold)
  hold()

  const button = document.getElementById('rotate-full')
  if (!button) return
  if (!canForceLandscape()) {
    button.hidden = true
    return
  }
  button.addEventListener('click', () => {
    forceLandscape().catch(() => {
      // refused (iOS, or fullscreen denied): the notice stays and the player rotates the phone
      button.hidden = true
    })
  })
}
