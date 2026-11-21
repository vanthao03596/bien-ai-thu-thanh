// The star tree: stars won in battle buy small, lasting improvements. Every
// step is a few percent of one number or one small extra, so the tree rewards
// playing on without undoing the difficulty of a level.

export type BranchId = 'archery' | 'sorcery' | 'gunnery' | 'tactics'

export const BRANCH_IDS: readonly BranchId[] = ['archery', 'sorcery', 'gunnery', 'tactics']
export const UPGRADE_TIERS = 3

/** How many steps of every branch the player owns, 0 to UPGRADE_TIERS. */
export type UpgradeTiers = Record<BranchId, number>

export interface UpgradeNode {
  name: string
  text: string
  /** stars */
  cost: number
}

export interface BranchDef {
  id: BranchId
  name: string
  /** frame of ui/icons_16 */
  icon: string
  nodes: readonly [UpgradeNode, UpgradeNode, UpgradeNode]
}

/** The numbers behind the texts below; the simulation reads them through boostsFor. */
const V = {
  archerRange: 0.06,
  archerHaste: 0.08,
  archerDouble: 0.1,
  mageRange: 0.06,
  mageDmg: 0.1,
  magePierce: 0.2,
  blast: 0.08,
  artilleryHaste: 0.08,
  fireHaste: 0.15,
  soldierHp: 0.1,
  respawn: 0.2,
  heroHp: 0.15,
  reinforceLife: 0.25,
} as const

function pct(v: number): number {
  return Math.round(v * 100)
}

export const UPGRADES: Record<BranchId, BranchDef> = {
  archery: {
    id: 'archery', name: 'Cung thuật', icon: 'bow',
    nodes: [
      { name: 'Mắt chim ưng', text: `Tầm bắn của tháp cung +${pct(V.archerRange)}%.`, cost: 1 },
      { name: 'Tay cung thuần thục', text: `Tháp cung bắn nhanh hơn ${pct(V.archerHaste)}%.`, cost: 1 },
      { name: 'Song tiễn', text: `Mỗi phát có ${pct(V.archerDouble)}% cơ hội bắn kèm một mũi tên nữa.`, cost: 1 },
    ],
  },
  sorcery: {
    id: 'sorcery', name: 'Pháp thuật', icon: 'magic',
    nodes: [
      { name: 'Tháp cao gió lộng', text: `Tầm bắn của tháp phép +${pct(V.mageRange)}%.`, cost: 1 },
      { name: 'Chú ngữ cổ', text: `Sát thương của tháp phép +${pct(V.mageDmg)}%.`, cost: 1 },
      { name: 'Xuyên kết giới', text: `Phép của tháp bỏ qua ${pct(V.magePierce)}% kháng phép.`, cost: 1 },
    ],
  },
  gunnery: {
    id: 'gunnery', name: 'Hỏa khí', icon: 'bomb',
    nodes: [
      { name: 'Thuốc nổ hảo hạng', text: `Vùng nổ của tháp pháo rộng thêm ${pct(V.blast)}%.`, cost: 1 },
      { name: 'Pháo thủ lành nghề', text: `Tháp pháo nạp đạn nhanh hơn ${pct(V.artilleryHaste)}%.`, cost: 1 },
      { name: 'Trời giáng lửa', text: `Mưa lửa hồi nhanh hơn ${pct(V.fireHaste)}%.`, cost: 1 },
    ],
  },
  tactics: {
    id: 'tactics', name: 'Binh pháp', icon: 'shield',
    nodes: [
      { name: 'Luyện binh', text: `Lính doanh trại +${pct(V.soldierHp)}% máu.`, cost: 1 },
      { name: 'Quân dự bị', text: `Lính ngã xuống được thay nhanh hơn ${pct(V.respawn)}%.`, cost: 1 },
      { name: 'Chí khí', text: `Tướng +${pct(V.heroHp)}% máu, viện binh ở lại lâu hơn ${pct(V.reinforceLife)}%.`, cost: 1 },
    ],
  },
}

export function noUpgrades(): UpgradeTiers {
  return { archery: 0, sorcery: 0, gunnery: 0, tactics: 0 }
}

function clampTier(v: number): number {
  return Math.min(UPGRADE_TIERS, Math.max(0, Math.floor(v)))
}

/** Stars paid for the steps owned. */
export function starsSpent(tiers: UpgradeTiers): number {
  let n = 0
  for (const id of BRANCH_IDS) {
    for (let i = 0; i < clampTier(tiers[id]); i++) n += UPGRADES[id].nodes[i].cost
  }
  return n
}

/** Stars the whole tree costs. */
export const TREE_COST = starsSpent({ archery: UPGRADE_TIERS, sorcery: UPGRADE_TIERS, gunnery: UPGRADE_TIERS, tactics: UPGRADE_TIERS })

/** Multipliers and chances a battle fights with. All 1 (or 0 for chances) without upgrades. */
export interface Boosts {
  archerRange: number
  archerCooldown: number
  /** chance of a second arrow */
  archerDouble: number
  mageRange: number
  mageDmg: number
  /** fraction of magic resistance the mage towers ignore */
  magePierce: number
  blast: number
  artilleryCooldown: number
  fireCooldown: number
  soldierHp: number
  respawn: number
  heroHp: number
  reinforceLife: number
}

export const NO_BOOSTS: Boosts = {
  archerRange: 1, archerCooldown: 1, archerDouble: 0,
  mageRange: 1, mageDmg: 1, magePierce: 0,
  blast: 1, artilleryCooldown: 1, fireCooldown: 1,
  soldierHp: 1, respawn: 1, heroHp: 1, reinforceLife: 1,
}

/**
 * What the owned steps are worth in battle. cap is the highest step a game
 * mode lets count: the challenges are balanced around a fixed strength, however
 * many stars the player has collected.
 */
export function boostsFor(tiers: UpgradeTiers, cap = UPGRADE_TIERS): Boosts {
  const has = (id: BranchId, tier: number): boolean => Math.min(cap, clampTier(tiers[id])) >= tier
  return {
    archerRange: has('archery', 1) ? 1 + V.archerRange : 1,
    archerCooldown: has('archery', 2) ? 1 - V.archerHaste : 1,
    archerDouble: has('archery', 3) ? V.archerDouble : 0,
    mageRange: has('sorcery', 1) ? 1 + V.mageRange : 1,
    mageDmg: has('sorcery', 2) ? 1 + V.mageDmg : 1,
    magePierce: has('sorcery', 3) ? V.magePierce : 0,
    blast: has('gunnery', 1) ? 1 + V.blast : 1,
    artilleryCooldown: has('gunnery', 2) ? 1 - V.artilleryHaste : 1,
    fireCooldown: has('gunnery', 3) ? 1 - V.fireHaste : 1,
    soldierHp: has('tactics', 1) ? 1 + V.soldierHp : 1,
    respawn: has('tactics', 2) ? 1 - V.respawn : 1,
    heroHp: has('tactics', 3) ? 1 + V.heroHp : 1,
    reinforceLife: has('tactics', 3) ? 1 + V.reinforceLife : 1,
  }
}
