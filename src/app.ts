import Phaser from 'phaser'
import { Sfx } from './audio'
import { LEVELS } from './data/levels'
import { loadSave, storeSave, type SaveData } from './save'

export const SCENE = { boot: 'boot', battle: 'battle', menu: 'menu', hud: 'hud' } as const

export interface BattleInit {
  levelIndex: number
  /** a bot plays; shown behind the menus */
  demo: boolean
}

export interface MenuInit {
  screen: 'title' | 'levels'
}

/** State shared by every scene: sound and saved progress. */
export const sfx = new Sfx()
export const save: SaveData = loadSave()

/** Routes the synthesised effects through Phaser's sound manager. */
export function initAudio(game: Phaser.Game): void {
  sfx.muted = save.muted
  game.sound.mute = save.muted
  const manager = game.sound
  if (manager instanceof Phaser.Sound.WebAudioSoundManager) sfx.attach(manager.context, manager.destination)
}

export function toggleMute(game: Phaser.Game): void {
  save.muted = !save.muted
  sfx.muted = save.muted
  game.sound.mute = save.muted
  storeSave(save)
}

export function levelUnlocked(index: number): boolean {
  return index === 0 || (save.stars[LEVELS[index - 1].id] ?? 0) >= 1
}

export function recordWin(levelId: string, stars: number): void {
  save.stars[levelId] = Math.max(save.stars[levelId] ?? 0, stars)
  storeSave(save)
}

// ---------------------------------------------------------------- screen flow

const FADE_MS = 220
const FADE_RGB = [29, 19, 34] as const
let switching = false

export function fadeIn(scene: Phaser.Scene): void {
  scene.cameras.main.fadeIn(FADE_MS, FADE_RGB[0], FADE_RGB[1], FADE_RGB[2])
}

/** Fades every running scene to the ink colour, then runs the scene switch. */
function fadeThen(from: Phaser.Scene, action: (plugin: Phaser.Scenes.ScenePlugin) => void): void {
  if (switching) return
  switching = true
  for (const s of from.scene.manager.getScenes(true)) {
    s.cameras.main.fadeOut(FADE_MS, FADE_RGB[0], FADE_RGB[1], FADE_RGB[2])
  }
  from.time.delayedCall(FADE_MS + 30, () => {
    switching = false
    action(from.scene)
  })
}

export function isSwitching(): boolean {
  return switching
}

function relaunch(plugin: Phaser.Scenes.ScenePlugin, key: string, data: object): void {
  if (plugin.key === key) {
    plugin.restart(data)
  } else {
    plugin.stop(key)
    plugin.launch(key, data)
  }
}

/** Starts (or restarts) a level with the battle HUD on top. */
export function startLevel(from: Phaser.Scene, levelIndex: number): void {
  fadeThen(from, (plugin) => {
    const init: BattleInit = { levelIndex, demo: false }
    relaunch(plugin, SCENE.battle, init)
    relaunch(plugin, SCENE.hud, {})
    if (plugin.key !== SCENE.menu) plugin.stop(SCENE.menu)
    else plugin.stop()
  })
}

/** Returns to the menus with a bot battle running behind them. */
export function showMenu(from: Phaser.Scene, screen: MenuInit['screen'], demoLevel = 0): void {
  fadeThen(from, (plugin) => {
    const init: BattleInit = { levelIndex: demoLevel, demo: true }
    const menu: MenuInit = { screen }
    relaunch(plugin, SCENE.battle, init)
    relaunch(plugin, SCENE.menu, menu)
    if (plugin.key !== SCENE.hud) plugin.stop(SCENE.hud)
    else plugin.stop()
  })
}

/** Swaps the level of the background battle without touching the menu. */
export function nextDemo(from: Phaser.Scene, levelIndex: number): void {
  const init: BattleInit = { levelIndex, demo: true }
  from.cameras.main.fadeOut(FADE_MS, FADE_RGB[0], FADE_RGB[1], FADE_RGB[2])
  from.time.delayedCall(FADE_MS + 30, () => from.scene.restart(init))
}
