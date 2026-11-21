// The ways a map can be played. The campaign is the level as written; a
// challenge keeps the map and asks a different question of it; endless goes on
// until the gate falls.

import type { LevelDef } from './levels'
import { SPEC_IDS } from './towers'

export type ModeId = 'campaign' | 'laststand' | 'siege' | 'endless'
export type ChallengeId = 'laststand' | 'siege'

export const MODES: readonly ModeId[] = ['campaign', 'laststand', 'siege', 'endless']
export const CHALLENGES: readonly ChallengeId[] = ['laststand', 'siege']
export const DEFAULT_MODE: ModeId = 'campaign'

/** Stars a map can pay: three for the campaign and one for every challenge. */
export const CAMPAIGN_STARS = 3
export const STARS_PER_LEVEL = CAMPAIGN_STARS + CHALLENGES.length

/** The highest step of the star tree that counts in a challenge. */
export const CHALLENGE_UPGRADE_TIER = 1

export interface ModeInfo {
  id: ModeId
  name: string
  blurb: string
}

export const MODE_INFO: Record<ModeId, ModeInfo> = {
  campaign: { id: 'campaign', name: 'Chiến dịch', blurb: 'Màn chơi gốc. Giữ càng nhiều mạng càng nhiều sao, tối đa ba sao.' },
  laststand: { id: 'laststand', name: 'Tử thủ', blurb: 'Một mạng duy nhất, sáu đợt quái dữ. Không được để lọt con nào. Thắng được một sao.' },
  siege: { id: 'siege', name: 'Vây hãm', blurb: 'Một mạng, một đợt quái rất dài, vài loại tháp bị khóa. Thắng được một sao.' },
  endless: { id: 'endless', name: 'Vô tận', blurb: 'Quái mạnh dần và không bao giờ hết. Trụ được bao nhiêu đợt, ghi bao nhiêu điểm?' },
}

export function isMode(v: unknown): v is ModeId {
  return typeof v === 'string' && (MODES as readonly string[]).includes(v)
}

export function isChallenge(mode: ModeId): mode is ChallengeId {
  return mode === 'laststand' || mode === 'siege'
}

export function nextMode(mode: ModeId): ModeId {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length]
}

/**
 * The level as one mode plays it: the same map with the lives, gold, waves and
 * towers of that mode. The battle only ever sees the result, so it needs no
 * rules of its own for the modes.
 */
export function resolveLevel(level: LevelDef, mode: ModeId): LevelDef {
  if (mode === 'campaign') return level
  if (mode === 'endless') {
    // every branch is open: without the fourth tier nothing keeps up with the growth
    return { ...level, startGold: level.endless.gold, lives: level.endless.lives, waves: [], specs: SPEC_IDS }
  }
  const m = level.modes[mode]
  return {
    ...level,
    startGold: m.gold,
    lives: m.lives,
    waves: m.waves,
    towers: level.towers.filter((t) => !m.lockedTowers.includes(t)),
    specs: level.specs?.filter((s) => !(m.lockedSpecs?.includes(s) ?? false)),
  }
}

/** The step of the star tree a mode caps the player at; undefined when everything counts. */
export function upgradeCap(level: LevelDef, mode: ModeId): number | undefined {
  return isChallenge(mode) ? level.modes[mode].maxUpgradeTier : undefined
}
