import type { EnemyType } from './enemies'
import type { TowerType } from './towers'
import type { TileCoord } from '../sim/path'

export const MAP_COLS = 24
export const MAP_ROWS = 14
export const VIEW_W = 768
export const VIEW_H = 432

/** One batch of identical enemies inside a wave. */
export interface WaveGroup {
  type: EnemyType
  count: number
  /** seconds between two spawns of this group */
  gap: number
  /** seconds after the wave starts before the first spawn */
  at: number
  /** index of the path the group walks (default 0) */
  path?: number
}

export interface WaveDef {
  groups: WaveGroup[]
}

export interface PropDef {
  /** frame name of props/props_static, or: oak, pine, campfire, grass */
  kind: string
  /** tile coordinates of the ground anchor */
  x: number
  y: number
}

export interface LevelDef {
  id: string
  name: string
  blurb: string
  seed: number
  /** waypoints on tile grid lines; the road is 2 tiles wide around them */
  paths: TileCoord[][]
  /** how each path start is decorated */
  spawns: ('edge' | 'portal' | 'cave')[]
  /** water rectangles as [col0, row0, col1, row1], inclusive */
  water: [number, number, number, number][]
  /** bridge centres in tile coordinates */
  bridges: TileCoord[]
  gate: TileCoord
  /** build plot anchors in tile coordinates */
  plots: TileCoord[]
  heroStart: TileCoord
  props: PropDef[]
  towers: TowerType[]
  startGold: number
  lives: number
  waves: WaveDef[]
}

function g(type: EnemyType, count: number, gap: number, at = 0, path = 0): WaveGroup {
  return { type, count, gap, at, path }
}

const meadow: LevelDef = {
  id: 'meadow',
  name: 'Đồng Cỏ Biên Ải',
  blurb: 'Toán yêu tinh đầu tiên tràn qua đồng cỏ. Hãy dựng tuyến phòng thủ đầu tiên.',
  seed: 11,
  paths: [[[-1, 5], [7, 5], [7, 11], [14, 11], [14, 5], [19, 5], [19, 2]]],
  spawns: ['edge'],
  water: [],
  bridges: [],
  gate: [19, 2],
  plots: [
    [3.5, 3.4], [4.5, 7.0], [9.0, 7.5], [11.5, 9.4], [10.5, 12.6], [12.0, 6.2],
    [16.5, 7.2], [16.5, 3.4], [21.0, 4.2], [5.0, 9.8], [17.0, 10.5],
  ],
  heroStart: [14, 8],
  props: [
    { kind: 'signpost', x: 1.2, y: 6.6 },
    { kind: 'tent', x: 22.2, y: 8.2 },
    { kind: 'campfire', x: 20.6, y: 8.6 },
    { kind: 'crate', x: 21.2, y: 7.3 },
    { kind: 'barrel', x: 23.2, y: 8.6 },
    { kind: 'well', x: 9.6, y: 3.4 },
    { kind: 'fence_h', x: 20.6, y: 1.9 },
    { kind: 'fence_h', x: 21.6, y: 1.9 },
    { kind: 'fence_h', x: 16.4, y: 1.9 },
    { kind: 'stump', x: 1.5, y: 9.5 },
  ],
  towers: ['archer', 'barracks', 'mage', 'artillery'],
  startGold: 260,
  lives: 20,
  waves: [
    { groups: [g('goblin', 8, 1.3)] },
    { groups: [g('goblin', 12, 0.9)] },
    { groups: [g('goblin', 10, 0.8), g('wolf', 5, 1.2, 8)] },
    { groups: [g('skeleton', 6, 1.6), g('goblin', 12, 0.7, 5)] },
    { groups: [g('orc', 5, 2.2), g('wolf', 8, 0.9, 6)] },
    { groups: [g('bat', 8, 1.1), g('skeleton', 8, 1.3, 3)] },
    { groups: [g('orc', 6, 1.8), g('goblin', 16, 0.5, 4), g('wolf', 8, 0.8, 14)] },
    { groups: [g('skeleton', 12, 1.0), g('bat', 10, 0.9, 6), g('orc', 4, 2.0, 12)] },
    { groups: [g('ogre', 1, 1), g('orc', 8, 1.6, 2), g('goblin', 20, 0.45, 6), g('wolf', 10, 0.7, 16)] },
  ],
}

const creek: LevelDef = {
  id: 'creek',
  name: 'Khe Suối Đá',
  blurb: 'Hai cánh quân hợp lại trước cây cầu gỗ. Giữ được cầu là giữ được thành.',
  seed: 23,
  paths: [
    [[-1, 3], [5, 3], [5, 10], [16, 10], [16, 6], [20, 6], [20, 2]],
    [[9, 15], [9, 10], [16, 10], [16, 6], [20, 6], [20, 2]],
  ],
  spawns: ['edge', 'edge'],
  water: [[11, 0, 12, 13]],
  bridges: [[12, 10]],
  gate: [20, 2],
  plots: [
    [2.5, 5.2], [7.0, 4.5], [7.0, 7.8], [3.0, 9.5], [6.8, 12.2], [9.8, 8.4],
    [14.0, 8.4], [14.0, 12.2], [18.2, 8.6], [17.8, 4.4], [22.3, 5.0], [14.2, 5.0],
  ],
  heroStart: [13.5, 10],
  props: [
    { kind: 'signpost', x: 1.0, y: 4.6 },
    { kind: 'rock_large_mossy', x: 10.3, y: 3.2 },
    { kind: 'rock_medium', x: 13.6, y: 2.0 },
    { kind: 'rock_large', x: 10.4, y: 13.2 },
    { kind: 'well', x: 22.2, y: 9.6 },
    { kind: 'tent', x: 21.6, y: 11.6 },
    { kind: 'campfire', x: 20.0, y: 12.2 },
    { kind: 'barrel', x: 23.0, y: 11.8 },
    { kind: 'fence_h', x: 17.4, y: 1.9 },
    { kind: 'fence_h', x: 22.6, y: 1.9 },
    { kind: 'ruin_pillar_broken', x: 2.6, y: 11.4 },
  ],
  towers: ['archer', 'barracks', 'mage', 'artillery'],
  startGold: 320,
  lives: 20,
  waves: [
    { groups: [g('goblin', 10, 1.0)] },
    { groups: [g('goblin', 8, 0.9, 0, 1), g('wolf', 6, 1.1, 5)] },
    { groups: [g('skeleton', 8, 1.3), g('goblin', 10, 0.7, 3, 1)] },
    { groups: [g('orc', 6, 1.8), g('bat', 8, 1.1, 4, 1)] },
    { groups: [g('shaman', 2, 5, 3), g('skeleton', 12, 1.0), g('wolf', 10, 0.7, 6, 1)] },
    { groups: [g('dark_knight', 3, 4.5), g('goblin', 20, 0.45, 2, 1), g('bat', 10, 0.9, 10)] },
    { groups: [g('orc', 10, 1.4), g('shaman', 3, 5, 4), g('orc', 8, 1.6, 3, 1)] },
    { groups: [g('ogre', 2, 9), g('wolf', 18, 0.5, 2, 1), g('bat', 14, 0.7, 8)] },
    { groups: [g('dark_knight', 5, 3.5), g('skeleton', 18, 0.8, 2, 1), g('shaman', 3, 4, 6, 1)] },
    { groups: [g('goblin', 30, 0.35), g('orc', 14, 1.0, 4, 1), g('bat', 16, 0.6, 12, 1)] },
    { groups: [g('ogre', 2, 8), g('dark_knight', 5, 3.2, 4, 1), g('wolf', 20, 0.45, 10), g('shaman', 3, 4, 12)] },
    {
      groups: [
        g('ogre', 2, 7, 0, 1), g('orc', 16, 0.9, 2), g('skeleton', 18, 0.8, 8, 1),
        g('dark_knight', 5, 3, 16), g('bat', 18, 0.55, 20, 1),
      ],
    },
  ],
}

const hellgate: LevelDef = {
  id: 'hellgate',
  name: 'Cổng Quỷ',
  blurb: 'Hai cổng tà thuật mở ra giữa phế tích. Quỷ vương sẽ đích thân xuất trận.',
  seed: 37,
  paths: [
    [[4, 2], [4, 6], [10, 6], [10, 11], [17, 11], [17, 7], [21, 7], [21, 3]],
    [[1, 11], [10, 11], [17, 11], [17, 7], [21, 7], [21, 3]],
  ],
  spawns: ['portal', 'cave'],
  water: [[12, 1, 15, 3]],
  bridges: [],
  gate: [21, 3],
  plots: [
    [6.0, 3.6], [1.6, 4.8], [7.0, 8.2], [12.2, 6.6], [4.0, 9.3], [7.0, 12.6], [12.8, 9.4],
    [13.5, 12.6], [15.2, 8.0], [19.0, 9.4], [18.5, 5.4], [22.6, 6.0], [19.0, 12.2], [8.0, 4.6],
  ],
  heroStart: [10, 9],
  props: [
    { kind: 'ruin_pillar', x: 6.6, y: 1.9 },
    { kind: 'ruin_pillar_broken', x: 1.6, y: 2.2 },
    { kind: 'ruin_pillar', x: 9.0, y: 2.4 },
    { kind: 'bones', x: 5.9, y: 7.6 },
    { kind: 'bones', x: 2.2, y: 12.8 },
    { kind: 'bones', x: 11.6, y: 5.0 },
    { kind: 'ruin_pillar_broken', x: 15.6, y: 5.8 },
    { kind: 'rock_large', x: 22.6, y: 11.6 },
    { kind: 'rock_medium_mossy', x: 16.6, y: 13.1 },
    { kind: 'tent', x: 18.6, y: 2.9 },
    { kind: 'campfire', x: 17.0, y: 3.4 },
    { kind: 'fence_h', x: 23.2, y: 2.9 },
  ],
  towers: ['archer', 'barracks', 'mage', 'artillery'],
  startGold: 400,
  lives: 20,
  waves: [
    { groups: [g('goblin', 10, 0.9), g('goblin', 8, 1.0, 3, 1)] },
    { groups: [g('wolf', 8, 0.9), g('skeleton', 6, 1.4, 2, 1)] },
    { groups: [g('orc', 5, 1.8), g('bat', 8, 1.0, 3, 1)] },
    { groups: [g('skeleton', 10, 1.0), g('shaman', 2, 5, 3), g('wolf', 10, 0.7, 5, 1)] },
    { groups: [g('dark_knight', 2, 5), g('orc', 6, 1.6, 2, 1), g('bat', 8, 0.9, 8)] },
    { groups: [g('goblin', 24, 0.4), g('ogre', 1, 1, 6, 1), g('shaman', 2, 4, 8, 1)] },
    { groups: [g('dark_knight', 4, 3.5), g('skeleton', 14, 0.8, 2, 1), g('bat', 10, 0.8, 10, 1)] },
    { groups: [g('ogre', 2, 7), g('orc', 10, 1.2, 3, 1), g('wolf', 14, 0.5, 10)] },
    { groups: [g('shaman', 4, 3), g('dark_knight', 4, 3.0, 2, 1), g('goblin', 20, 0.4, 8), g('bat', 12, 0.7, 12, 1)] },
    { groups: [g('ogre', 3, 6), g('orc', 12, 1.0, 2, 1), g('skeleton', 14, 0.8, 8), g('dark_knight', 3, 3, 16, 1)] },
    { groups: [g('ogre', 2, 5, 0, 1), g('dark_knight', 5, 2.5), g('wolf', 18, 0.45, 6, 1), g('bat', 14, 0.6, 10), g('shaman', 3, 3, 12)] },
    { groups: [g('orc', 16, 0.9), g('skeleton', 16, 0.8, 2, 1), g('ogre', 2, 6, 10), g('bat', 16, 0.6, 14, 1)] },
    { groups: [g('dark_knight', 6, 2.5), g('dark_knight', 5, 3, 3, 1), g('shaman', 4, 3, 6), g('wolf', 20, 0.4, 12, 1)] },
    { groups: [g('ogre', 4, 5), g('ogre', 3, 6, 4, 1), g('goblin', 30, 0.35, 8), g('bat', 18, 0.5, 16, 1), g('orc', 10, 1.0, 20)] },
    {
      groups: [
        g('demon_boss', 1, 1, 4), g('orc', 12, 1.2, 0, 1), g('skeleton', 14, 1.0, 10),
        g('dark_knight', 6, 3.5, 14, 1), g('ogre', 3, 7, 22, 1), g('goblin', 24, 0.45, 30), g('bat', 16, 0.6, 36),
      ],
    },
  ],
}

export const LEVELS: readonly LevelDef[] = [meadow, creek, hellgate]
