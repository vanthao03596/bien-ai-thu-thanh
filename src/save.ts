const KEY = 'bien-ai-save-v1'

export interface SaveData {
  /** best star rating per level id */
  stars: Record<string, number>
  muted: boolean
  /** ids of the beginner tips the player no longer needs */
  tips: string[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function loadSave(): SaveData {
  const data: SaveData = { stars: {}, muted: false, tips: [] }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return data
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return data
    if (isRecord(parsed.stars)) {
      for (const [id, v] of Object.entries(parsed.stars)) {
        if (typeof v === 'number' && v >= 1 && v <= 3) data.stars[id] = Math.floor(v)
      }
    }
    data.muted = parsed.muted === true
    if (Array.isArray(parsed.tips)) {
      for (const id of parsed.tips as unknown[]) {
        if (typeof id === 'string' && !data.tips.includes(id)) data.tips.push(id)
      }
    }
  } catch {
    // storage can be blocked (private mode); the game simply starts fresh
  }
  return data
}

export function storeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // progress is kept in memory for this session only
  }
}
