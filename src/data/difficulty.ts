export type Difficulty = 'easy' | 'normal' | 'hard'

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard']
export const DEFAULT_DIFFICULTY: Difficulty = 'normal'

export interface DifficultyDef {
  id: Difficulty
  name: string
  blurb: string
  /** multiplier on the hit points of every enemy */
  hp: number
}

/**
 * Enemy data is written for the hardest setting; the easier ones only scale it
 * down. Towers, prices and bounties are the same on every setting, so a tower
 * always feels the same and only the enemy side changes.
 */
export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  easy: { id: 'easy', name: 'Dễ', blurb: 'Quái ít máu hơn hẳn. Dành cho người mới.', hp: 0.8 },
  normal: { id: 'normal', name: 'Thường', blurb: 'Mức cân bằng chuẩn của trò chơi.', hp: 0.9 },
  hard: { id: 'hard', name: 'Khó', blurb: 'Quái đủ máu. Cần đúng tháp, đúng chỗ.', hp: 1 },
}

export function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === 'string' && (DIFFICULTIES as readonly string[]).includes(v)
}

export function nextDifficulty(d: Difficulty): Difficulty {
  return DIFFICULTIES[(DIFFICULTIES.indexOf(d) + 1) % DIFFICULTIES.length]
}
