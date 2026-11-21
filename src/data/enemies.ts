export type EnemyType =
  | 'goblin'
  | 'wolf'
  | 'skeleton'
  | 'orc'
  | 'bat'
  | 'shaman'
  | 'dark_knight'
  | 'ogre'
  | 'demon_boss'
  | 'goblin_archer'
  | 'ghost_wolf'
  | 'berserker'
  | 'hexer'
  | 'necromancer'
  | 'brood_bat'
  | 'troll'
  | 'warchief'
  | 'ogre_king'

/**
 * What an enemy can do besides walking and biting. The simulation handles every
 * kind generically, so a new enemy is only a new entry in the table below.
 */
export type EnemyAbility =
  /** casts a heal on wounded allies around it */
  | { kind: 'heal'; amount: number; radius: number; cooldown: number }
  /** stops to shoot soldiers from a distance */
  | { kind: 'ranged'; range: number; dmg: readonly [number, number]; cooldown: number }
  /** raises helpers next to itself, at most `casts` times; they pay no bounty */
  | { kind: 'summon'; type: EnemyType; count: number; cooldown: number; casts: number }
  /** bursts into smaller enemies when it dies */
  | { kind: 'split'; type: EnemyType; count: number }
  /** moves and hits harder once its health drops below the threshold */
  | { kind: 'enrage'; below: number; speed: number; dmg: number }
  /** grows health back while nothing has hurt it for `delay` seconds */
  | { kind: 'regen'; perSec: number; delay: number }
  /** allies around it march faster */
  | { kind: 'haste'; radius: number; speed: number }
  /** silences a shooting tower in range for a while */
  | { kind: 'disable'; range: number; time: number; cooldown: number }
  /** slams the ground, hurting every soldier around it */
  | { kind: 'quake'; radius: number; dmg: readonly [number, number]; cooldown: number }
  /** walks straight through soldiers: it cannot be blocked */
  | { kind: 'ethereal' }

export type AbilityKind = EnemyAbility['kind']

export interface EnemyDef {
  type: EnemyType
  name: string
  sheet: string
  hp: number
  /** pixels per second */
  speed: number
  /** fraction of physical damage ignored, 0..1 */
  armor: number
  /** fraction of magic damage ignored, 0..1 */
  magicRes: number
  gold: number
  /** lives removed when it reaches the gate */
  lives: number
  dmg: readonly [number, number]
  /** seconds between melee swings */
  atkCd: number
  flying: boolean
  /** body half-width, used for melee spacing and splash checks */
  radius: number
  /** height of the sprite above its feet, for health bars and hit points */
  height: number
  shadow: 'effects/shadow_small' | 'effects/shadow_medium' | 'effects/shadow_large'
  boss?: boolean
  abilities?: readonly EnemyAbility[]
  /** one line for the wave preview, for enemies that need a special answer */
  trait?: string
  /** variants reuse a sheet of the pack, told apart by colour, size and opacity */
  tint?: number
  scale?: number
  alpha?: number
}

// Hit points and bounties follow the suggestedStats shipped with each enemy sheet of the pack.
export const ENEMIES: Record<EnemyType, EnemyDef> = {
  goblin: {
    type: 'goblin', name: 'Yêu tinh', sheet: 'enemies/goblin',
    hp: 20, speed: 36, armor: 0, magicRes: 0, gold: 3, lives: 1,
    dmg: [2, 4], atkCd: 1.0, flying: false, radius: 6, height: 20, shadow: 'effects/shadow_small',
  },
  wolf: {
    type: 'wolf', name: 'Sói hoang', sheet: 'enemies/wolf',
    hp: 35, speed: 60, armor: 0, magicRes: 0, gold: 5, lives: 1,
    dmg: [3, 5], atkCd: 0.9, flying: false, radius: 8, height: 16, shadow: 'effects/shadow_medium',
  },
  skeleton: {
    type: 'skeleton', name: 'Bộ xương', sheet: 'enemies/skeleton',
    hp: 60, speed: 30, armor: 0.2, magicRes: 0, gold: 8, lives: 1,
    dmg: [4, 7], atkCd: 1.0, flying: false, radius: 6, height: 22, shadow: 'effects/shadow_small',
  },
  orc: {
    type: 'orc', name: 'Orc', sheet: 'enemies/orc',
    hp: 80, speed: 27, armor: 0.2, magicRes: 0, gold: 10, lives: 1,
    dmg: [6, 10], atkCd: 1.2, flying: false, radius: 7, height: 22, shadow: 'effects/shadow_medium',
  },
  bat: {
    type: 'bat', name: 'Dơi quỷ', sheet: 'enemies/bat',
    hp: 30, speed: 48, armor: 0, magicRes: 0, gold: 6, lives: 1,
    dmg: [0, 0], atkCd: 1, flying: true, radius: 6, height: 26, shadow: 'effects/shadow_small',
  },
  shaman: {
    type: 'shaman', name: 'Pháp sư bộ lạc', sheet: 'enemies/shaman',
    hp: 50, speed: 26, armor: 0, magicRes: 0.6, gold: 12, lives: 1,
    dmg: [3, 6], atkCd: 1.2, flying: false, radius: 6, height: 24, shadow: 'effects/shadow_small',
    abilities: [{ kind: 'heal', amount: 26, radius: 64, cooldown: 5 }],
    trait: 'hồi máu cho quái xung quanh',
  },
  dark_knight: {
    type: 'dark_knight', name: 'Hắc kỵ sĩ', sheet: 'enemies/dark_knight',
    hp: 180, speed: 21, armor: 0.65, magicRes: 0, gold: 20, lives: 2,
    dmg: [14, 22], atkCd: 1.4, flying: false, radius: 7, height: 24, shadow: 'effects/shadow_medium',
  },
  ogre: {
    type: 'ogre', name: 'Chằn tinh', sheet: 'enemies/ogre',
    hp: 600, speed: 18, armor: 0, magicRes: 0, gold: 40, lives: 3,
    dmg: [28, 42], atkCd: 1.6, flying: false, radius: 11, height: 36, shadow: 'effects/shadow_large',
  },
  demon_boss: {
    type: 'demon_boss', name: 'Quỷ vương', sheet: 'enemies/demon_boss',
    hp: 3000, speed: 12, armor: 0.4, magicRes: 0.3, gold: 200, lives: 20,
    dmg: [70, 110], atkCd: 1.8, flying: false, radius: 15, height: 52, shadow: 'effects/shadow_large',
    boss: true,
    abilities: [
      { kind: 'quake', radius: 54, dmg: [45, 70], cooldown: 8 },
      { kind: 'summon', type: 'bat', count: 3, cooldown: 13, casts: 8 },
      { kind: 'disable', range: 130, time: 5, cooldown: 14 },
    ],
    trait: 'dậm đất hạ lính, gọi dơi và yểm bùa khóa tháp',
  },
  goblin_archer: {
    type: 'goblin_archer', name: 'Yêu tinh xạ thủ', sheet: 'enemies/goblin',
    hp: 30, speed: 32, armor: 0, magicRes: 0, gold: 5, lives: 1,
    dmg: [2, 4], atkCd: 1.0, flying: false, radius: 6, height: 20, shadow: 'effects/shadow_small',
    abilities: [{ kind: 'ranged', range: 96, dmg: [6, 10], cooldown: 1.6 }],
    trait: 'bắn lính từ xa',
    tint: 0xd8f070,
  },
  ghost_wolf: {
    type: 'ghost_wolf', name: 'Sói ma', sheet: 'enemies/wolf',
    hp: 36, speed: 50, armor: 0.8, magicRes: 0, gold: 8, lives: 1,
    dmg: [3, 5], atkCd: 0.9, flying: false, radius: 8, height: 16, shadow: 'effects/shadow_medium',
    abilities: [{ kind: 'ethereal' }],
    trait: 'lướt xuyên qua lính, gần như miễn sát thương vật lý',
    tint: 0x9fe0ff, alpha: 0.7,
  },
  berserker: {
    type: 'berserker', name: 'Orc cuồng nộ', sheet: 'enemies/orc',
    hp: 140, speed: 26, armor: 0.1, magicRes: 0, gold: 14, lives: 1,
    dmg: [8, 13], atkCd: 1.1, flying: false, radius: 7, height: 22, shadow: 'effects/shadow_medium',
    abilities: [{ kind: 'enrage', below: 0.5, speed: 1.9, dmg: 1.6 }],
    trait: 'nổi điên khi còn nửa máu: chạy nhanh, đánh đau',
    tint: 0xff9a88,
  },
  hexer: {
    type: 'hexer', name: 'Phù thủy yểm bùa', sheet: 'enemies/shaman',
    hp: 80, speed: 24, armor: 0, magicRes: 0.6, gold: 18, lives: 1,
    dmg: [3, 6], atkCd: 1.2, flying: false, radius: 6, height: 24, shadow: 'effects/shadow_small',
    abilities: [{ kind: 'disable', range: 110, time: 4, cooldown: 9 }],
    trait: 'yểm bùa khóa tháp bắn',
    tint: 0xff8fa0,
  },
  necromancer: {
    type: 'necromancer', name: 'Thầy gọi hồn', sheet: 'enemies/shaman',
    hp: 110, speed: 22, armor: 0, magicRes: 0.5, gold: 25, lives: 2,
    dmg: [4, 7], atkCd: 1.2, flying: false, radius: 6, height: 24, shadow: 'effects/shadow_small',
    abilities: [{ kind: 'summon', type: 'skeleton', count: 2, cooldown: 8, casts: 4 }],
    trait: 'liên tục gọi bộ xương',
    tint: 0xa98cff,
  },
  brood_bat: {
    type: 'brood_bat', name: 'Dơi chúa', sheet: 'enemies/bat',
    hp: 140, speed: 34, armor: 0, magicRes: 0, gold: 14, lives: 2,
    dmg: [0, 0], atkCd: 1, flying: true, radius: 9, height: 38, shadow: 'effects/shadow_medium',
    abilities: [{ kind: 'split', type: 'bat', count: 3 }],
    trait: 'chết thì vỡ thành ba dơi quỷ',
    tint: 0xe0a8ff, scale: 1.5,
  },
  troll: {
    type: 'troll', name: 'Quỷ đầm lầy', sheet: 'enemies/ogre',
    hp: 420, speed: 20, armor: 0, magicRes: 0, gold: 30, lives: 2,
    dmg: [20, 30], atkCd: 1.5, flying: false, radius: 9, height: 30, shadow: 'effects/shadow_large',
    abilities: [{ kind: 'regen', perSec: 16, delay: 2.5 }],
    trait: 'tự hồi máu khi không bị đánh',
    tint: 0x9ad88a, scale: 0.85,
  },
  warchief: {
    type: 'warchief', name: 'Tù trưởng Orc', sheet: 'enemies/orc',
    hp: 380, speed: 22, armor: 0.35, magicRes: 0, gold: 35, lives: 3,
    dmg: [16, 24], atkCd: 1.3, flying: false, radius: 9, height: 28, shadow: 'effects/shadow_medium',
    abilities: [{ kind: 'haste', radius: 72, speed: 1.3 }],
    trait: 'thúc quái xung quanh chạy nhanh hơn',
    tint: 0xffd67a, scale: 1.3,
  },
  ogre_king: {
    type: 'ogre_king', name: 'Chúa chằn', sheet: 'enemies/ogre',
    hp: 1800, speed: 14, armor: 0.25, magicRes: 0, gold: 120, lives: 10,
    dmg: [45, 65], atkCd: 1.7, flying: false, radius: 15, height: 52, shadow: 'effects/shadow_large',
    boss: true,
    abilities: [
      { kind: 'quake', radius: 48, dmg: [30, 45], cooldown: 7 },
      { kind: 'regen', perSec: 10, delay: 3 },
    ],
    trait: 'dậm đất hạ lính và tự hồi máu',
    tint: 0xffb070, scale: 1.45,
  },
}

/** The ability of the given kind, if the enemy type has one. */
export function abilityOf<K extends AbilityKind>(def: EnemyDef, kind: K): Extract<EnemyAbility, { kind: K }> | undefined {
  return def.abilities?.find((a): a is Extract<EnemyAbility, { kind: K }> => a.kind === kind)
}
