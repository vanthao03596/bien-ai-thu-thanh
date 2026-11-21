import Phaser from 'phaser'
import { Sfx } from './audio'
import { DIFFICULTIES, nextDifficulty, type Difficulty } from './data/difficulty'
import type { EnemyType } from './data/enemies'
import { LEVELS } from './data/levels'
import { DEFAULT_MODE, STARS_PER_LEVEL, nextMode, type ChallengeId, type ModeId } from './data/modes'
import { UPGRADES, UPGRADE_TIERS, noUpgrades, starsSpent, type BranchId } from './data/upgrades'
import { applyOutcome, emptySave, loadSave, starsEarned, storeSave, type EndlessRecord, type SaveData } from './save'
import type { Outcome } from './session'

export const SCENE = { boot: 'boot', battle: 'battle', menu: 'menu', hud: 'hud' } as const

export interface BattleInit {
  levelIndex: number
  /** how the map is played */
  mode: ModeId
  /** a bot plays; shown behind the menus */
  demo: boolean
}

/** Game-wide events sent through game.events. */
export const APP_EVENT = {
  /** the game is covered (rotate-your-phone notice): a running battle should pause */
  hold: 'app-hold',
} as const

export interface MenuInit {
  screen: 'title' | 'levels' | 'upgrades'
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

/** Best campaign rating of a level on a difficulty (the chosen one unless told otherwise); 0 when never won there. */
export function bestStars(levelId: string, difficulty: Difficulty = save.difficulty): number {
  return save.stars[difficulty][levelId] ?? 0
}

/** The campaign battle of the level has been won, on any difficulty. */
function campaignWon(levelId: string): boolean {
  return DIFFICULTIES.some((d) => bestStars(levelId, d) >= 1)
}

/** A level opens once the one before it has been won, on any difficulty. */
export function levelUnlocked(index: number): boolean {
  return index === 0 || campaignWon(LEVELS[index - 1].id)
}

/** The challenges and the endless battle of a map open once its campaign battle has been won. */
export function modeUnlocked(index: number, mode: ModeId): boolean {
  return mode === 'campaign' ? levelUnlocked(index) : campaignWon(LEVELS[index].id)
}

/** The challenge has been won on a difficulty (the chosen one unless told otherwise). */
export function challengeWon(levelId: string, mode: ChallengeId, difficulty: Difficulty = save.difficulty): boolean {
  return save.challenges[difficulty][mode].includes(levelId)
}

/** The best endless run on a map and the chosen difficulty, or null. */
export function endlessBest(levelId: string, difficulty: Difficulty = save.difficulty): EndlessRecord | null {
  return save.endless[difficulty][levelId] ?? null
}

/** Writes the end of a battle into the save. Returns true when it set a new endless record. */
export function recordOutcome(o: Outcome): boolean {
  const record = applyOutcome(save, o)
  storeSave(save)
  return record
}

/** Moves on to the next difficulty setting and remembers it. */
export function cycleDifficulty(): Difficulty {
  save.difficulty = nextDifficulty(save.difficulty)
  storeSave(save)
  return save.difficulty
}

/** The game mode chosen on the level screen; it lasts until the page is closed. */
let chosenMode: ModeId = DEFAULT_MODE

export function currentMode(): ModeId {
  return chosenMode
}

export function cycleMode(): ModeId {
  chosenMode = nextMode(chosenMode)
  return chosenMode
}

// ---------------------------------------------------------------- stars

export const MAX_STARS = LEVELS.length * STARS_PER_LEVEL

const LEVEL_IDS = LEVELS.map((level) => level.id)

/** Stars won so far, to spend in the star tree (see starsEarned in save.ts). */
export function earnedStars(): number {
  return starsEarned(save, LEVEL_IDS)
}

/** Stars not yet spent in the star tree. */
export function freeStars(): number {
  return earnedStars() - starsSpent(save.upgrades)
}

/** Stars the next step of a branch costs, or null when the branch is complete. */
export function upgradePrice(branch: BranchId): number | null {
  const tier = save.upgrades[branch]
  return tier < UPGRADE_TIERS ? UPGRADES[branch].nodes[tier].cost : null
}

/** Buys the next step of a branch when the stars are there. */
export function buyUpgrade(branch: BranchId): boolean {
  const price = upgradePrice(branch)
  if (price === null || price > freeStars()) return false
  save.upgrades[branch] += 1
  storeSave(save)
  return true
}

/** Hands every spent star back, to try another build. */
export function refundUpgrades(): void {
  save.upgrades = noUpgrades()
  storeSave(save)
}

// a save edited by hand, or one from a version that paid stars differently, may have spent more than it earned
if (freeStars() < 0) save.upgrades = noUpgrades()

/** Something was won or learned that a reset would wipe. */
export function hasProgress(): boolean {
  return (
    save.tips.length > 0 ||
    save.seen.length > 0 ||
    DIFFICULTIES.some((d) => Object.keys(save.stars[d]).length > 0 || Object.keys(save.endless[d]).length > 0)
  )
}

/** A beginner tip or a wave tip has done its job and is not shown again. */
export function retireTip(id: string): void {
  if (save.tips.includes(id)) return
  save.tips.push(id)
  storeSave(save)
}

/** The player has been introduced to an enemy type. */
export function markSeen(type: EnemyType): void {
  if (save.seen.includes(type)) return
  save.seen.push(type)
  storeSave(save)
}

/** Forgets everything that was won, bought and learned; the sound and difficulty settings stay. */
export function resetProgress(): void {
  const fresh = emptySave()
  save.stars = fresh.stars
  save.challenges = fresh.challenges
  save.endless = fresh.endless
  save.upgrades = fresh.upgrades
  save.seen = []
  save.tips = []
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

/** Starts (or restarts) a level in a game mode, with the battle HUD on top. */
export function startLevel(from: Phaser.Scene, levelIndex: number, mode: ModeId): void {
  fadeThen(from, (plugin) => {
    const init: BattleInit = { levelIndex, mode, demo: false }
    relaunch(plugin, SCENE.battle, init)
    relaunch(plugin, SCENE.hud, {})
    if (plugin.key !== SCENE.menu) plugin.stop(SCENE.menu)
    else plugin.stop()
  })
}

/** Returns to the menus with a bot battle running behind them. */
export function showMenu(from: Phaser.Scene, screen: MenuInit['screen'], demoLevel = 0): void {
  fadeThen(from, (plugin) => {
    const init: BattleInit = { levelIndex: demoLevel, mode: DEFAULT_MODE, demo: true }
    const menu: MenuInit = { screen }
    relaunch(plugin, SCENE.battle, init)
    relaunch(plugin, SCENE.menu, menu)
    if (plugin.key !== SCENE.hud) plugin.stop(SCENE.hud)
    else plugin.stop()
  })
}

/** Swaps the level of the background battle without touching the menu. */
export function nextDemo(from: Phaser.Scene, levelIndex: number): void {
  const init: BattleInit = { levelIndex, mode: DEFAULT_MODE, demo: true }
  from.cameras.main.fadeOut(FADE_MS, FADE_RGB[0], FADE_RGB[1], FADE_RGB[2])
  from.time.delayedCall(FADE_MS + 30, () => from.scene.restart(init))
}
