import { DEFAULT_DIFFICULTY, DIFFICULTIES, isDifficulty, type Difficulty } from './data/difficulty'
import { CAMPAIGN_STARS, CHALLENGES, isChallenge, type ChallengeId } from './data/modes'
import { BRANCH_IDS, UPGRADE_TIERS, noUpgrades, type UpgradeTiers } from './data/upgrades'
import type { Outcome } from './session'

const KEY = 'bien-ai-save-v1'

export type StarBook = Record<string, number>
/** Level ids of the challenges won. */
export type ChallengeBook = Record<ChallengeId, string[]>

export interface EndlessRecord {
  /** the wave the best run reached */
  wave: number
  score: number
}

export interface SaveData {
  /** best star rating of the campaign battle per level id, kept apart for every difficulty */
  stars: Record<Difficulty, StarBook>
  /** challenges won, kept apart for every difficulty */
  challenges: Record<Difficulty, ChallengeBook>
  /** best endless run per level id, kept apart for every difficulty */
  endless: Record<Difficulty, Record<string, EndlessRecord>>
  /** steps of the star tree the player has bought */
  upgrades: UpgradeTiers
  /** enemy types the player has been introduced to */
  seen: string[]
  /** the difficulty the player last chose */
  difficulty: Difficulty
  muted: boolean
  /** ids of the beginner tips and wave tips the player no longer needs */
  tips: string[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function noChallenges(): ChallengeBook {
  return { laststand: [], siege: [] }
}

export function emptySave(): SaveData {
  return {
    stars: { easy: {}, normal: {}, hard: {} },
    challenges: { easy: noChallenges(), normal: noChallenges(), hard: noChallenges() },
    endless: { easy: {}, normal: {}, hard: {} },
    upgrades: noUpgrades(),
    seen: [],
    difficulty: DEFAULT_DIFFICULTY,
    muted: false,
    tips: [],
  }
}

function readStars(into: StarBook, from: Record<string, unknown>): void {
  for (const [id, v] of Object.entries(from)) {
    if (typeof v === 'number' && v >= 1 && v <= 3) into[id] = Math.floor(v)
  }
}

/** Copies the strings of a stored list, each one once. */
function readStrings(into: string[], from: unknown): void {
  if (!Array.isArray(from)) return
  for (const v of from as unknown[]) {
    if (typeof v === 'string' && !into.includes(v)) into.push(v)
  }
}

function wholeNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null
}

/** Builds a save from whatever was stored, keeping only what is well formed. */
export function parseSave(parsed: unknown): SaveData {
  const data = emptySave()
  if (!isRecord(parsed)) return data
  if (isRecord(parsed.stars)) {
    // saves from before the difficulty settings hold one flat book, earned on what is now "normal"
    readStars(data.stars.normal, parsed.stars)
    for (const d of DIFFICULTIES) {
      const book = parsed.stars[d]
      if (isRecord(book)) readStars(data.stars[d], book)
    }
  }
  for (const d of DIFFICULTIES) {
    const won = isRecord(parsed.challenges) ? parsed.challenges[d] : null
    if (isRecord(won)) {
      for (const mode of CHALLENGES) readStrings(data.challenges[d][mode], won[mode])
    }
    const runs = isRecord(parsed.endless) ? parsed.endless[d] : null
    if (isRecord(runs)) {
      for (const [id, run] of Object.entries(runs)) {
        if (!isRecord(run)) continue
        const wave = wholeNumber(run.wave)
        const score = wholeNumber(run.score)
        if (wave !== null && score !== null && wave >= 1) data.endless[d][id] = { wave, score }
      }
    }
  }
  if (isRecord(parsed.upgrades)) {
    for (const id of BRANCH_IDS) {
      const tier = wholeNumber(parsed.upgrades[id])
      if (tier !== null) data.upgrades[id] = Math.min(UPGRADE_TIERS, tier)
    }
  }
  readStrings(data.seen, parsed.seen)
  if (isDifficulty(parsed.difficulty)) data.difficulty = parsed.difficulty
  data.muted = parsed.muted === true
  readStrings(data.tips, parsed.tips)
  return data
}

/**
 * Stars the save has to spend in the star tree. A map pays its best campaign
 * rating and one star per challenge, whatever difficulty they were won on:
 * playing again on another setting never pays the same star twice.
 */
export function starsEarned(data: SaveData, levelIds: readonly string[]): number {
  let n = 0
  for (const id of levelIds) {
    n += Math.min(CAMPAIGN_STARS, Math.max(...DIFFICULTIES.map((d) => data.stars[d][id] ?? 0)))
    for (const mode of CHALLENGES) {
      if (DIFFICULTIES.some((d) => data.challenges[d][mode].includes(id))) n += 1
    }
  }
  return n
}

/**
 * Writes the end of a battle into the save: the rating of a campaign win, a
 * won challenge, or how far an endless battle got. A defeat anywhere else
 * leaves no trace. Returns true when it set a new endless record.
 */
export function applyOutcome(data: SaveData, o: Outcome): boolean {
  if (o.mode === 'endless') {
    const best = data.endless[o.difficulty][o.levelId]
    if (best && o.score <= best.score) return false
    data.endless[o.difficulty][o.levelId] = { wave: o.wave, score: o.score }
    return true
  }
  if (!o.won) return false
  if (isChallenge(o.mode)) {
    const won = data.challenges[o.difficulty][o.mode]
    if (!won.includes(o.levelId)) won.push(o.levelId)
  } else {
    data.stars[o.difficulty][o.levelId] = Math.max(data.stars[o.difficulty][o.levelId] ?? 0, o.stars)
  }
  return false
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return parseSave(JSON.parse(raw))
  } catch {
    // storage can be blocked (private mode); the game simply starts fresh
  }
  return emptySave()
}

export function storeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // progress is kept in memory for this session only
  }
}
