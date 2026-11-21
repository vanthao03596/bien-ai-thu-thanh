import type { DamageKind } from '../sim/types'

export type TowerType = 'archer' | 'mage' | 'artillery' | 'barracks'

export const TOWER_TYPES: readonly TowerType[] = ['archer', 'barracks', 'mage', 'artillery']

/** How the info panel names each kind of damage. */
export const DAMAGE_KIND_NAME: Record<DamageKind, string> = {
  physical: 'vật lý',
  explosion: 'nổ',
  magic: 'phép',
  true: 'chuẩn',
}

export const MAX_LEVEL = 2 // zero based: levels 0, 1, 2

/** Vertical squash of every range circle (the map is seen from above at an angle). */
export const RANGE_SQUASH = 0.75

export interface TowerDef {
  type: TowerType
  name: string
  blurb: string
  /** sheet key without the level suffix */
  sheetBase: string
  /** price of level 1, then the price of each upgrade */
  cost: readonly [number, number, number]
  range: readonly [number, number, number]
  /** seconds between shots (unused for barracks) */
  cooldown: readonly [number, number, number]
  dmg: readonly [readonly [number, number], readonly [number, number], readonly [number, number]]
  /** what the shots are made of: decides how armor and resistance answer them */
  dmgKind: DamageKind
  /** artillery: blast radius */
  splash: readonly [number, number, number]
  /** barracks: soldier hit points and armor */
  soldierHp: readonly [number, number, number]
  soldierArmor: readonly [number, number, number]
}

export const TOWERS: Record<TowerType, TowerDef> = {
  archer: {
    type: 'archer', name: 'Tháp cung', blurb: 'Bắn nhanh, tầm xa, hạ được quái bay. Kém trước giáp dày.',
    sheetBase: 'towers/archer_tower',
    cost: [70, 110, 160],
    range: [130, 145, 160],
    cooldown: [0.8, 0.65, 0.5],
    dmg: [[4, 6], [7, 11], [11, 17]],
    dmgKind: 'physical',
    splash: [0, 0, 0],
    soldierHp: [0, 0, 0],
    soldierArmor: [0, 0, 0],
  },
  mage: {
    type: 'mage', name: 'Tháp phép', blurb: 'Phép thuật bỏ qua giáp. Cấp 3 làm chậm.',
    sheetBase: 'towers/mage_tower',
    cost: [100, 160, 240],
    range: [112, 124, 138],
    cooldown: [1.5, 1.5, 1.4],
    dmg: [[10, 16], [24, 38], [42, 64]],
    dmgKind: 'magic',
    splash: [0, 0, 0],
    soldierHp: [0, 0, 0],
    soldierArmor: [0, 0, 0],
  },
  artillery: {
    type: 'artillery', name: 'Tháp pháo', blurb: 'Nổ lan, giáp chỉ cản một nửa. Không bắn quái bay.',
    sheetBase: 'towers/artillery_tower',
    cost: [125, 220, 320],
    range: [120, 132, 146],
    cooldown: [3.0, 3.0, 2.8],
    dmg: [[10, 18], [22, 36], [40, 62]],
    dmgKind: 'explosion',
    splash: [34, 38, 44],
    soldierHp: [0, 0, 0],
    soldierArmor: [0, 0, 0],
  },
  barracks: {
    type: 'barracks', name: 'Doanh trại', blurb: 'Ba người lính chặn đường quái.',
    sheetBase: 'towers/barracks',
    cost: [70, 110, 160],
    range: [105, 105, 105],
    cooldown: [0, 0, 0],
    dmg: [[2, 4], [4, 7], [7, 12]],
    dmgKind: 'physical',
    splash: [0, 0, 0],
    soldierHp: [50, 85, 130],
    soldierArmor: [0, 0.15, 0.3],
  },
}

// ---------------------------------------------------------------- specialisations

/** The fourth tier: every tower type branches into two specialisations. */
export type SpecId = 'repeater' | 'marksman' | 'frost' | 'storm' | 'bombard' | 'rocket' | 'guard' | 'blade'

export const MAX_SKILL_RANK = 3

type Ranks = readonly [number, number, number]

interface SkillBase {
  name: string
  /** price of rank 1, 2 and 3 */
  cost: Ranks
  /** frame of ui/icons_16 */
  icon: string
}

/** Skill prices follow one rule: a base price for the first rank, then the same step for every further rank. */
function price(base: number, step: number): Ranks {
  return [base, step, step]
}

/**
 * Purchasable skills of the specialisations. Every list of three holds one
 * value per rank, and every skill grows along one such list only: a rank makes
 * a skill hit harder, or last longer, or reach more targets, never all at once.
 */
export const SKILLS = {
  poison: { name: 'Tên tẩm độc', cost: price(100, 80), icon: 'skull', dps: [3, 5, 8], time: 4 },
  volley: { name: 'Loạt tiễn', cost: price(120, 100), icon: 'wave', targets: [3, 5, 7], cooldown: 8 },
  headshot: { name: 'Phát chí mạng', cost: price(130, 110), icon: 'star', chance: [0.15, 0.25, 0.35], mult: 2.5 },
  cripple: { name: 'Tên xuyên gân', cost: price(90, 70), icon: 'hourglass', time: [1, 1.75, 2.5], factor: 0.5 },
  blizzard: { name: 'Bão tuyết', cost: price(150, 120), icon: 'wave', freeze: [1.2, 1.8, 2.4], radius: 60, cooldown: 12 },
  shatter: { name: 'Băng vỡ', cost: price(120, 100), icon: 'star', part: [0.3, 0.5, 0.7], radius: 30 },
  chain: { name: 'Sét lan', cost: price(140, 120), icon: 'wave', jumps: [1, 2, 3], part: 0.6, radius: 64 },
  sunder: { name: 'Phá giáp', cost: price(110, 90), icon: 'shield', shred: [0.1, 0.18, 0.26] },
  cluster: { name: 'Đạn chùm', cost: price(160, 130), icon: 'star', bomblets: [2, 3, 4], part: 0.4, scatter: 30, splash: 26 },
  oil: { name: 'Dầu lửa', cost: price(140, 110), icon: 'fire', dps: [6, 10, 14], time: 4, radius: 34 },
  barrage: { name: 'Loạt hỏa tiễn', cost: price(150, 120), icon: 'wave', rockets: [4, 6, 8], cooldown: 14 },
  concuss: { name: 'Chấn động', cost: price(130, 100), icon: 'hourglass', stun: [0.3, 0.5, 0.7] },
  mend: { name: 'Tự chữa thương', cost: price(100, 80), icon: 'heart', perSec: [4, 7, 10] },
  thorns: { name: 'Giáp gai', cost: price(110, 90), icon: 'star', dmg: [5, 9, 14] },
  cleave: { name: 'Chém lan', cost: price(120, 100), icon: 'wave', part: [0.4, 0.6, 0.8], radius: 16 },
  knives: { name: 'Phi đao', cost: price(110, 90), icon: 'bow', dmg: [12, 20, 28], range: 70, cooldown: 2.5 },
} as const

export type SkillId = keyof typeof SKILLS

/** Name, price and icon of every skill, for code that treats them alike. */
export const SKILL_INFO: Record<SkillId, SkillBase> = SKILLS

function pct(v: number): number {
  return Math.round(v * 100)
}

/** What a skill does at the given rank (1 to 3), for the info panel. */
export function skillText(id: SkillId, rank: number): string {
  const i = Math.min(MAX_SKILL_RANK, Math.max(1, rank)) - 1
  switch (id) {
    case 'poison':
      return `Mũi tên gây độc ${SKILLS.poison.dps[i]} máu mỗi giây trong ${SKILLS.poison.time}s, bỏ qua giáp.`
    case 'volley':
      return `Cứ ${SKILLS.volley.cooldown}s bắn cùng lúc ${SKILLS.volley.targets[i]} quái trong tầm.`
    case 'headshot':
      return `${pct(SKILLS.headshot.chance[i])}% cơ hội gây sát thương x${SKILLS.headshot.mult}.`
    case 'cripple':
      return `Trúng tên bị chậm ${pct(1 - SKILLS.cripple.factor)}% trong ${SKILLS.cripple.time[i]}s.`
    case 'blizzard':
      return `Cứ ${SKILLS.blizzard.cooldown}s đóng băng cả đám quái trong ${SKILLS.blizzard.freeze[i]}s. Boss chỉ bị chậm.`
    case 'shatter':
      return `Đạn băng vỡ ra, gây ${pct(SKILLS.shatter.part[i])}% sát thương và làm chậm quái xung quanh.`
    case 'chain':
      return `Tia sét nhảy sang ${SKILLS.chain.jumps[i]} quái gần đó với ${pct(SKILLS.chain.part)}% sát thương.`
    case 'sunder':
      return `Mỗi tia sét bào mòn vĩnh viễn ${pct(SKILLS.sunder.shred[i])} điểm giáp của mục tiêu.`
    case 'cluster':
      return `Đạn nổ văng ra ${SKILLS.cluster.bomblets[i]} quả bom con, mỗi quả ${pct(SKILLS.cluster.part)}% sát thương.`
    case 'oil':
      return `Chỗ đạn rơi cháy ${SKILLS.oil.time}s, đốt ${SKILLS.oil.dps[i]} máu mỗi giây, bỏ qua giáp.`
    case 'barrage':
      return `Cứ ${SKILLS.barrage.cooldown}s phóng loạt ${SKILLS.barrage.rockets[i]} hỏa tiễn vào quái trong tầm.`
    case 'concuss':
      return `Vụ nổ làm choáng quái ${SKILLS.concuss.stun[i]}s. Không tác dụng lên boss.`
    case 'mend':
      return `Lính hồi ${SKILLS.mend.perSec[i]} máu mỗi giây, kể cả khi đang đánh.`
    case 'thorns':
      return `Quái đánh trúng lính bị phản ${SKILLS.thorns.dmg[i]} sát thương, bỏ qua giáp.`
    case 'cleave':
      return `Mỗi nhát chém trúng thêm quái đứng sát với ${pct(SKILLS.cleave.part[i])}% sát thương.`
    case 'knives':
      return `Cứ ${SKILLS.knives.cooldown}s mỗi lính phóng dao gây ${SKILLS.knives.dmg[i]} sát thương, trúng cả quái bay.`
  }
}

export interface SpecDef {
  id: SpecId
  base: TowerType
  name: string
  blurb: string
  cost: number
  /** frame of ui/icons_16 */
  icon: string
  /** the pack has no fourth-tier art: the level 3 sprite is tinted instead */
  tint: number
  range: number
  cooldown: number
  dmg: readonly [number, number]
  splash: number
  soldierHp: number
  soldierArmor: number
  /** barracks: seconds between two swings of a soldier */
  soldierAtkCd: number
  skills: readonly [SkillId, SkillId]
}

export const SPECS: Record<SpecId, SpecDef> = {
  repeater: {
    id: 'repeater', base: 'archer', name: 'Liên nỗ', blurb: 'Nỏ liên châu bắn dồn dập. Mạnh với quái đông, yếu trước giáp dày.',
    cost: 230, icon: 'fast', tint: 0xffd9a0,
    range: 150, cooldown: 0.32, dmg: [9, 14], splash: 0,
    soldierHp: 0, soldierArmor: 0, soldierAtkCd: 0,
    skills: ['poison', 'volley'],
  },
  marksman: {
    id: 'marksman', base: 'archer', name: 'Thần xạ', blurb: 'Tầm bắn cực xa, mỗi phát rất nặng và xuyên nửa lớp giáp.',
    cost: 260, icon: 'bow', tint: 0xa8e6b0,
    range: 215, cooldown: 1.9, dmg: [60, 90], splash: 0,
    soldierHp: 0, soldierArmor: 0, soldierAtkCd: 0,
    skills: ['headshot', 'cripple'],
  },
  frost: {
    id: 'frost', base: 'mage', name: 'Tháp băng', blurb: 'Làm chậm một nửa tốc độ trong thời gian dài, khống chế cả đám.',
    cost: 280, icon: 'hourglass', tint: 0xa8dcff,
    range: 140, cooldown: 1.3, dmg: [44, 66], splash: 0,
    soldierHp: 0, soldierArmor: 0, soldierAtkCd: 0,
    skills: ['blizzard', 'shatter'],
  },
  storm: {
    id: 'storm', base: 'mage', name: 'Tháp sấm', blurb: 'Sát thương phép cao nhất, đánh lan và phá giáp. Không làm chậm.',
    cost: 300, icon: 'lightning', tint: 0xfff08a,
    range: 150, cooldown: 1.5, dmg: [70, 105], splash: 0,
    soldierHp: 0, soldierArmor: 0, soldierAtkCd: 0,
    skills: ['chain', 'sunder'],
  },
  bombard: {
    id: 'bombard', base: 'artillery', name: 'Thần công', blurb: 'Đại pháo nổ rất rộng và rất mạnh, nạp đạn chậm. Không bắn quái bay.',
    cost: 360, icon: 'bomb', tint: 0xffb38a,
    range: 160, cooldown: 3.2, dmg: [70, 110], splash: 56,
    soldierHp: 0, soldierArmor: 0, soldierAtkCd: 0,
    skills: ['cluster', 'oil'],
  },
  rocket: {
    id: 'rocket', base: 'artillery', name: 'Giàn hỏa tiễn', blurb: 'Hỏa tiễn bám mục tiêu, bắn nhanh, tầm xa, hạ được cả quái bay.',
    cost: 340, icon: 'fire', tint: 0xd8b8ff,
    range: 175, cooldown: 1.7, dmg: [34, 50], splash: 30,
    soldierHp: 0, soldierArmor: 0, soldierAtkCd: 0,
    skills: ['barrage', 'concuss'],
  },
  guard: {
    id: 'guard', base: 'barracks', name: 'Cấm vệ quân', blurb: 'Lính giáp nặng, rất lì đòn. Giữ chân quái mạnh lâu nhất.',
    cost: 250, icon: 'shield', tint: 0xb8ccff,
    range: 105, cooldown: 0, dmg: [10, 16], splash: 0,
    soldierHp: 220, soldierArmor: 0.5, soldierAtkCd: 1.0,
    skills: ['mend', 'thorns'],
  },
  blade: {
    id: 'blade', base: 'barracks', name: 'Đao khách', blurb: 'Lính đánh nhanh và đau nhưng mỏng giáp hơn.',
    cost: 250, icon: 'sword', tint: 0xffb0a8,
    range: 105, cooldown: 0, dmg: [18, 28], splash: 0,
    soldierHp: 150, soldierArmor: 0.2, soldierAtkCd: 0.8,
    skills: ['cleave', 'knives'],
  },
}

export const SPEC_IDS = Object.keys(SPECS) as SpecId[]

/** The two branches of every tower type, in menu order. */
export const SPEC_CHOICES: Record<TowerType, readonly [SpecId, SpecId]> = {
  archer: ['repeater', 'marksman'],
  mage: ['frost', 'storm'],
  artillery: ['bombard', 'rocket'],
  barracks: ['guard', 'blade'],
}

/** Fraction of armor the marksman ignores. */
export const MARKSMAN_PIERCE = 0.5
export const FROST_SLOW = { factor: 0.5, time: 2.5 } as const
/** Seconds an enemy shrugs off further stuns after one wore off. */
export const STUN_IMMUNITY = 3

export const SELL_REFUND = 0.6
export const SOLDIER_RESPAWN = 10
export const SOLDIER_ATK_CD = 1.0
export const SOLDIERS_PER_BARRACKS = 3
export const MAGE_SLOW_FACTOR = 0.6
export const MAGE_SLOW_TIME = 1.5

export const HERO = {
  name: 'Thánh kỵ sĩ',
  sheet: 'heroes/hero_paladin',
  hp: 320,
  dmg: [12, 20] as const,
  armor: 0.4,
  atkCd: 1.0,
  speed: 62,
  respawn: 18,
  specialCd: 10,
  specialDmg: 45,
  specialRadius: 42,
  specialHeal: 0.15,
}

export const SPELLS = {
  fire: { name: 'Mưa lửa', cooldown: 50, count: 5, dmg: [45, 65] as const, radius: 30, scatter: 26 },
  reinforce: { name: 'Viện binh', cooldown: 22, count: 2, life: 18, hp: 60, dmg: [3, 6] as const },
}

/** The numbers a tower fights with, whether it is on a plain level or specialised. */
export interface TowerStats {
  range: number
  cooldown: number
  dmg: readonly [number, number]
  splash: number
  soldierHp: number
  soldierArmor: number
  soldierAtkCd: number
}

export function towerStats(type: TowerType, level: number, spec: SpecId | null): TowerStats {
  if (spec) return SPECS[spec]
  const def = TOWERS[type]
  return {
    range: def.range[level],
    cooldown: def.cooldown[level],
    dmg: def.dmg[level],
    splash: def.splash[level],
    soldierHp: def.soldierHp[level],
    soldierArmor: def.soldierArmor[level],
    soldierAtkCd: SOLDIER_ATK_CD,
  }
}

export function towerSheet(type: TowerType, level: number): string {
  return `${TOWERS[type].sheetBase}_l${level + 1}`
}
