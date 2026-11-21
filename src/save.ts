import { DEFAULT_DIFFICULTY, DIFFICULTIES, isDifficulty, type Difficulty } from './data/difficulty'

const KEY = 'bien-ai-save-v1'

export type StarBook = Record<string, number>

export interface SaveData {
  /** best star rating per level id, kept apart for every difficulty */
  stars: Record<Difficulty, StarBook>
  /** the difficulty the player last chose */
  difficulty: Difficulty
  muted: boolean
  /** ids of the beginner tips the player no longer needs */
  tips: string[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function emptySave(): SaveData {
  return { stars: { easy: {}, normal: {}, hard: {} }, difficulty: DEFAULT_DIFFICULTY, muted: false, tips: [] }
}

function readStars(into: StarBook, from: Record<string, unknown>): void {
  for (const [id, v] of Object.entries(from)) {
    if (typeof v === 'number' && v >= 1 && v <= 3) into[id] = Math.floor(v)
  }
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
  if (isDifficulty(parsed.difficulty)) data.difficulty = parsed.difficulty
  data.muted = parsed.muted === true
  if (Array.isArray(parsed.tips)) {
    for (const id of parsed.tips as unknown[]) {
      if (typeof id === 'string' && !data.tips.includes(id)) data.tips.push(id)
    }
  }
  return data
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
