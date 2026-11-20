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
  /** shaman only: heal amount per cast */
  heal?: number
  boss?: boolean
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
    heal: 26,
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
  },
}
